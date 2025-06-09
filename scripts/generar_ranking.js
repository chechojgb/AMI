#!/usr/bin/env node

const mysql = require('mysql2/promise');

// Configuración de origen (BD productiva)
const sourceDB = {
  host: '10.57.251.133',
  user: 'apli_consulta_telefonia',
  password: 'epSyVDbUucdC',
  database: 'miosv2-phone',
};

// Configuración de destino (BD de resumen)
const destDB = {
  host: '10.57.251.180',
  user: 'ranking',
  password: 'd6#:ohUP1$GE',
  database: 'telefonia_dash',
};

// 👉 Lista de operation_id que querés procesar (o dejar vacío para traer todos)
const OPERACIONES_PERMITIDAS = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16];

async function generarRanking(operation_id, source, dest) {
  const [campaigns] = await source.execute(
    'SELECT id FROM campaigns WHERE operation_id = ?',
    [operation_id]
  );

  const campaignIds = campaigns.map(c => c.id);
  if (campaignIds.length === 0) return;

  const placeholders = campaignIds.map(() => '?').join(',');

  const [allCalls] = await source.query(`
    SELECT user_id, COUNT(*) AS total_llamadas,
           SUM(TIMESTAMPDIFF(SECOND, response_time, end_call)) AS total_duracion
    FROM calls
    WHERE campaign_id IN (${placeholders})
      AND user_id IS NOT NULL
      AND response_time IS NOT NULL
      AND end_call IS NOT NULL
      AND DATE(created_at) = CURDATE()
    GROUP BY user_id
    UNION ALL
    SELECT t.user_id, COUNT(*) AS total_llamadas,
           SUM(TIMESTAMPDIFF(SECOND, c.response_time, c.end_call)) AS total_duracion
    FROM transfers t
    JOIN calls c ON c.id = t.call_id
    WHERE c.campaign_id IN (${placeholders})
      AND t.user_id IS NOT NULL
      AND c.response_time IS NOT NULL
      AND c.end_call IS NOT NULL
      AND DATE(c.created_at) = CURDATE()
    GROUP BY t.user_id
  `, [...campaignIds, ...campaignIds]);

  const rankingMap = new Map();
  for (const row of allCalls) {
    const prev = rankingMap.get(row.user_id) || { total_llamadas: 0, total_duracion: 0 };
    rankingMap.set(row.user_id, {
      total_llamadas: prev.total_llamadas + row.total_llamadas,
      total_duracion: prev.total_duracion + row.total_duracion
    });
  }

  const userIds = Array.from(rankingMap.keys());
  if (userIds.length === 0) return;

  const userPlaceholders = userIds.map(() => '?').join(',');
  const [users] = await source.query(
    `SELECT id, extension, username FROM usersv2 WHERE id IN (${userPlaceholders})`,
    userIds
  );

  // Fecha en hora local (evita problema de UTC adelantado)
  const hoy = new Date();
  const fecha = `${hoy.getFullYear()}-${(hoy.getMonth() + 1).toString().padStart(2, '0')}-${hoy.getDate().toString().padStart(2, '0')}`;

  for (const user of users) {
    const r = rankingMap.get(user.id);
    if (!r) continue;

    const promedio = parseFloat((r.total_duracion / r.total_llamadas).toFixed(2));

    await dest.execute(
      `INSERT INTO ranking_agentes (
         operation_id, user_id, agente, extension,
         total_llamadas, total_duracion, promedio_duracion, fecha
       )
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        operation_id,
        user.id,
        user.username,
        user.extension,
        r.total_llamadas,
        r.total_duracion,
        promedio,
        fecha
      ]
    );
  }

  console.log(`✅ Ranking guardado para operación ${operation_id}`);
}

async function main() {
  const source = await mysql.createConnection(sourceDB);
  const dest = await mysql.createConnection(destDB);

  // 🧹 Limpiar rankings de hoy
  await dest.execute(`DELETE FROM ranking_agentes WHERE fecha = CURDATE()`);
  console.log('🧹 Datos de hoy eliminados');

  let operaciones = OPERACIONES_PERMITIDAS;

  if (operaciones.length === 0) {
    const [rows] = await source.query('SELECT DISTINCT operation_id FROM campaigns');
    operaciones = rows.map(r => r.operation_id);
  }

  for (const opId of operaciones) {
    try {
      await generarRanking(opId, source, dest);
    } catch (err) {
      console.error(`❌ Error procesando operación ${opId}:`, err.message);
    }
  }

  await source.end();
  await dest.end();
}

main();

