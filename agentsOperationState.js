const express = require('express');
const AsteriskManager = require('asterisk-manager');

const app = express();
const port = 3016;

const ami = new AsteriskManager(
  5038,
  '10.57.251.179',
  'SoulPhone',
  'ResItcHiNGEn**',
  true
);
ami.keepConnected();

ami.on('connect', () => console.log('✅ Conectado al AMI'));
ami.on('error', err => console.error('❌ Error AMI:', err));

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
    const agentesMap = {};
    const contador = { disponibles: 0, ocupados: 0, pausa: 0 };

    for (const cola of colas) {
      console.log(`🟡 Consultando cola: ${cola}`);

      const respuesta = await new Promise((resolve, reject) => {
        ami.action({ action: 'Command', command: `queue show ${cola}` }, (err, resp) => {
          if (err) return reject(err);
          resolve(extractOutput(resp));
        });
      });

      const lineas = respuesta
        .replace(/\\n/g, '\n')
        .replace(/, {2,}/g, '\n')
        .split('\n')
        .map(l => l.trim())
        .filter(l => l.length > 0);

      let dentroDeMiembros = false;
      for (let linea of lineas) {
        if (linea.toLowerCase().startsWith('members:')) {
          dentroDeMiembros = true;
          continue;
        }

        if (dentroDeMiembros) {
          if (
            linea.toLowerCase().startsWith('no callers') ||
            linea.toLowerCase().startsWith('callers')
          ) break;

          const match = linea.match(/^(\S+)(?: \((SIP\/\d+)\))?/);
          const rawUsuario = match ? match[1] : null;
          const canal = match ? (match[2] || match[1]) : null;
          const extension = canal?.match(/SIP\/(\d+)/)?.[1];
          if (!extension || /Unavailable/i.test(linea)) continue;

          const claveAgente = extension;

          // Determinar estado
          let estado = 'ocupado'; // por defecto
          if (/Not in use/i.test(linea)) {
            estado = 'disponible';
          } else if (/paused/i.test(linea)) {
            estado = 'pausa';
          }

          if (!agentesMap[claveAgente]) {
            agentesMap[claveAgente] = {
              usuario: rawUsuario === canal ? extension : rawUsuario,
              extension,
              colas: [],
              estado
            };
          }

          agentesMap[claveAgente].colas.push(cola);

          const prioridad = { ocupado: 3, pausa: 2, disponible: 1 };
          if (prioridad[estado] > prioridad[agentesMap[claveAgente].estado]) {
            agentesMap[claveAgente].estado = estado;
          }
        }
      }
    }

    const disponibles = [];
    const ocupados = [];
    const pausa = [];

    Object.values(agentesMap).forEach((agente) => {
      if (agente.estado === 'ocupado') {
        ocupados.push(agente);
        contador.ocupados++;
      } else if (agente.estado === 'pausa') {
        pausa.push(agente);
        contador.pausa++;
      } else {
        disponibles.push(agente);
        contador.disponibles++;
      }
    });

    const resultado = {
      operacion: nombreOperacion,
      total: contador,
      agentes: Object.values(agentesMap),
      disponibles,
      ocupados,
      pausa
    };

    cache[nombreOperacion] = {
      timestamp: ahora,
      data: resultado
    };

    res.json(resultado);

  } catch (err) {
    console.error('❌ Error al consultar colas:', err);
    res.status(500).json({
      error: 'Error al obtener detalle de agentes por operación',
      detalles: err.message
    });
  }
});

app.listen(port, () => {
  console.log(`🚀 API de agentes por operación escuchando en http://localhost:${port}`);
});

