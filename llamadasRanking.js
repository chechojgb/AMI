const express = require('express');
const mysql = require('mysql2/promise');
const app = express();
const port = 3012;

const dbConfig = {
  host: '10.57.251.180',
  user: 'ranking', // usuario con SELECT sobre telefonia_dash
  password: 'd6#:ohUP1$GE',
  database: 'telefonia_dash',
};

app.get('/api/llamadas/ranking', async (req, res) => {
  const { operation_id } = req.query;
  if (!operation_id) {
    return res.status(400).json({ error: 'Falta el parámetro operation_id' });
  }

  try {
    const connection = await mysql.createConnection(dbConfig);

    const [result] = await connection.execute(`
      SELECT agente, extension, total_llamadas, total_duracion, promedio_duracion
      FROM ranking_agentes
      WHERE operation_id = ? AND fecha = CURDATE()
      ORDER BY total_llamadas DESC
      LIMIT 5
    `, [operation_id]);

    await connection.end();
    res.json(result);
  } catch (err) {
    console.error('❌ Error consultando el ranking:', err);
    res.status(500).json({ error: 'Error al consultar el ranking de agentes' });
  }
});

app.listen(port, () => {
  console.log(`✅ API de ranking activa en http://localhost:${port}/api/llamadas/ranking`);
});

