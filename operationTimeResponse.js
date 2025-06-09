const express = require('express');
const mysql = require('mysql2/promise');
const app = express();
const port = 3015;

const OPERATIONS = {
  Retencion: 5,
  Tramites: 2,
  Soporte: 1,
  Movil: 3,
  Pruebas: 24,
};

const pool = mysql.createPool({
  host: '10.57.251.133',
  user: 'apli_consulta_telefonia',
  password: 'epSyVDbUucdC',
  database: 'miosv2-phone',
  waitForConnections: true,
  connectionLimit: 10,
});

app.get('/tiempo-respuesta/:operacion', async (req, res) => {
  const nombreOperacion = req.params.operacion;
  const operationId = OPERATIONS[nombreOperacion];

  if (!operationId) {
    return res.status(400).json({ error: 'Operación no válida' });
  }

  const sql = `
    SELECT
      -- Promedio de respuesta del día
      (SELECT SEC_TO_TIME(AVG(TIMESTAMPDIFF(SECOND, created_at, response_time)))
       FROM (
         SELECT created_at, response_time FROM calls 
         WHERE DATE(created_at) = CURDATE() AND user_id IS NOT NULL 
         AND campaign_id IN (SELECT id FROM campaigns WHERE operation_id = ?)
         UNION ALL
         SELECT created_at, response_time FROM transfers 
         WHERE DATE(created_at) = CURDATE() AND user_id IS NOT NULL 
         AND campaign_id IN (SELECT id FROM campaigns WHERE operation_id = ?)
       ) AS dia) AS promedio_respuesta_dia,

      -- Promedio de respuesta de la última hora
      (SELECT SEC_TO_TIME(AVG(TIMESTAMPDIFF(SECOND, created_at, response_time)))
       FROM (
         SELECT created_at, response_time FROM calls 
         WHERE created_at >= NOW() - INTERVAL 1 HOUR AND user_id IS NOT NULL 
         AND campaign_id IN (SELECT id FROM campaigns WHERE operation_id = ?)
         UNION ALL
         SELECT created_at, response_time FROM transfers 
         WHERE created_at >= NOW() - INTERVAL 1 HOUR AND user_id IS NOT NULL 
         AND campaign_id IN (SELECT id FROM campaigns WHERE operation_id = ?)
       ) AS hora) AS promedio_respuesta_hora,

      -- Máximo histórico del día
      (SELECT SEC_TO_TIME(MAX(TIMESTAMPDIFF(SECOND, created_at, response_time)))
       FROM (
         SELECT created_at, response_time FROM calls 
         WHERE DATE(created_at) = CURDATE() AND user_id IS NOT NULL 
         AND campaign_id IN (SELECT id FROM campaigns WHERE operation_id = ?)
         UNION ALL
         SELECT created_at, response_time FROM transfers 
         WHERE DATE(created_at) = CURDATE() AND user_id IS NOT NULL 
         AND campaign_id IN (SELECT id FROM campaigns WHERE operation_id = ?)
       ) AS maximo) AS maximo_respuesta;
  `;

  try {
    const [rows] = await pool.execute(sql, [
      operationId, operationId, // para promedio_dia
      operationId, operationId, // para promedio_hora
      operationId, operationId  // para maximo_respuesta
    ]);
    res.json(rows[0]);
  } catch (error) {
    console.error('Error al consultar:', error);
    res.status(500).json({ error: 'Error al procesar la consulta' });
  }
});

app.listen(port, () => {
  console.log(`🚀 API de tiempo de respuesta escuchando en http://localhost:${port}`);
});

