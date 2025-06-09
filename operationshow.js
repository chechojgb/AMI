const express = require('express');
const AsteriskManager = require('asterisk-manager');

const app = express();
const port = 3014;

const ami = new AsteriskManager(5038, '10.57.251.179', 'SoulPhone', 'ResItcHiNGEn**', true);
ami.keepConnected();

ami.on('connect', () => console.log('Conectado al AMI'));
ami.on('error', err => console.error('Error AMI:', err));

const colaPorArea = {
  Retencion: ['Q1','Q3','Q5','Q16','Q23','Q74','Q77','Q78','Q79','Q80'],
  Tramites: ['Q4','Q6','Q7','Q8','Q9','Q10','Q11','Q12','Q13','Q14','Q15','Q104'],
  Soporte: ['Q17','Q18','Q19','Q20','Q21','Q22','Q24','Q25','Q26','Q70','Q71','Q81','Q82','Q100','Q103','Q106','Q110'],
  Movil: ['Q27','Q28','Q29','Q30','Q31','Q32','Q33','Q34','Q35','Q37'],
  Pruebas: ['Q102','Q107','Q108']
};

const extractOutput = (response) => {
  let output = typeof response === 'string'
    ? response
    : (response.output || response.message || response.content || response.data || '');
  return typeof output === 'string' ? output : output.toString();
};

// Cache en memoria
const cache = {};
const CACHE_TTL = 10 * 1000; // 10 segundos

app.get('/operacion/:nombre', async (req, res) => {
  const nombreOperacion = req.params.nombre;
  const colas = colaPorArea[nombreOperacion];

  if (!colas) {
    return res.status(400).json({
      error: 'Operación no válida. Usa: Retencion, Tramites, Soporte, Movil o Pruebas.'
    });
  }

  const ahora = Date.now();

  if (cache[nombreOperacion] && ahora - cache[nombreOperacion].timestamp < CACHE_TTL) {
    return res.json({ ...cache[nombreOperacion].data, cache: true });
  }

  try {
    const detalleColas = []; // ahora es un array

    for (const cola of colas) {
      console.log(`🟡 Consultando cola: ${cola}`);

      const respuesta = await new Promise((resolve, reject) => {
        ami.action({ action: 'Command', command: `queue show ${cola}` }, (err, resp) => {
          if (err) return reject(err);
          resolve(extractOutput(resp));
        });
      });

      console.log(`📋 Salida cruda para ${cola}:\n${respuesta}`);

      const lineas = respuesta
        .replace(/\\n/g, '\n')
        .replace(/, {2,}/g, '\n')
        .split('\n')
        .map(l => l.trim())
        .filter(l => l.length > 0);

      const primeraLinea = lineas[0];
      const match = primeraLinea.match(/has (\d+) calls/);
      const llamadas = match ? parseInt(match[1], 10) : 0;

      let total = 0;
      let ocupados = 0;
      let disponibles = 0;
      let noDisponibles = 0;

      let dentroDeMiembros = false;
      for (let linea of lineas) {
        console.log(`📌 [${cola}] Analizando: "${linea}"`);

        if (linea.toLowerCase().startsWith('members:')) {
          dentroDeMiembros = true;
          console.log(`✅ [${cola}] Se detectó inicio de bloque Members`);
          continue;
        }

        if (dentroDeMiembros) {
          if (
            linea.toLowerCase().startsWith('no callers') ||
            linea.toLowerCase().startsWith('callers')
          ) {
            console.log(`🔚 [${cola}] Fin de bloque Members`);
            break;
          }

          total++;

          if (linea.includes('Unavailable')) {
            noDisponibles++;
          } else if (/(Busy|in call)/i.test(linea)) {
            ocupados++;
          } else if (linea.includes('Not in use') || linea.includes('has taken')) {
            disponibles++;
          } else {
            disponibles++; // fallback
          }
        }
      }

      console.log(`📊 Resultado parcial para ${cola}:`, {
        llamadas,
        agentes_totales: total,
        agentes_ocupados: ocupados,
        agentes_disponibles: disponibles,
        agentes_no_disponibles: noDisponibles
      });

      detalleColas.push({
        cola,
        llamadas,
        agentes_totales: total,
        agentes_ocupados: ocupados,
        agentes_disponibles: disponibles,
        agentes_no_disponibles: noDisponibles
      });
    }

    const resultado = {
      operacion: nombreOperacion,
      detalle_colas: detalleColas
    };

    cache[nombreOperacion] = {
      timestamp: ahora,
      data: resultado
    };

    res.json(resultado);
  } catch (err) {
    console.error('❌ Error al consultar colas:', err);
    res.status(500).json({
      error: 'Error al obtener detalle de llamadas por operación',
      detalles: err.message
    });
  }
});

app.listen(port, () => {
  console.log(`🚀 API por operación escuchando en http://localhost:${port}`);
});

