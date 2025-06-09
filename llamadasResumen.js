const express = require('express');
const mysql = require('mysql2/promise');
const app = express();
const port = 3011;

const dbConfig = {
  host: '10.57.251.133',
  port: 3306,
  user: 'apli_consulta_telefonia',
  password: 'epSyVDbUucdC',
  database: 'miosv2-phone',
};

app.get('/api/llamadas/hoy', async (req, res) => {
  const { operation_id } = req.query;
  if (!operation_id) return res.status(400).json({ error: 'operation_id requerido' });

  try {
    const connection = await mysql.createConnection(dbConfig);

    const [result] = await connection.execute(
      `SELECT
        SUM(CASE
              WHEN c.user_id IS NOT NULL OR t.call_id IS NOT NULL THEN 1
              ELSE 0
            END) AS atendidas,
        SUM(CASE
              WHEN c.user_id IS NULL AND c.end_call IS NOT NULL AND t.call_id IS NULL THEN 1
              ELSE 0
            END) AS abandonadas,
        SUM(CASE
              WHEN c.user_id IS NULL AND c.end_call IS NULL AND t.call_id IS NULL THEN 1
              ELSE 0
            END) AS en_espera
      FROM calls c
      LEFT JOIN campaigns cp ON c.campaign_id = cp.id
      LEFT JOIN transfers t ON c.id = t.call_id
      WHERE cp.operation_id = ?
        AND c.created_at >= CURDATE()
        AND c.created_at < CURDATE() + INTERVAL 1 DAY`,
      [operation_id]
    );

    await connection.end();
    res.json(result[0]);
  } catch (err) {
    console.error('❌ Error:', err);
    res.status(500).json({ error: 'Error en la consulta de llamadas' });
  }
});

app.listen(port, () => {
  console.log(`✅ API de resumen de llamadas activa en http://localhost:${port}/api/llamadas/hoy`);
});

