const express = require('express');
const AsteriskManager = require('asterisk-manager');

const app = express();
const port = 3003;

const ami = new AsteriskManager(5038, '10.57.251.179', 'SoulPhone', 'ResItcHiNGEn**', true);
ami.keepConnected();

ami.on('connect', () => console.log('Conectado al AMI'));
ami.on('error', err => console.error('Error AMI:', err));

const extractOutput = (response) => {
  let output = typeof response === 'string'
    ? response
    : (response.output || response.message || response.content || response.data || '');
  return typeof output === 'string' ? output : output.toString();
};

const colaPorArea = {
  Retencion: ['Q1','Q3','Q5','Q16','Q23','Q74','Q77','Q78','Q79','Q80'],
  Tramites: ['Q4','Q6','Q7','Q8','Q9','Q10','Q11','Q12','Q13','Q14','Q15','Q104'],
  Soporte: ['Q17','Q18','Q19','Q20','Q21','Q22','Q24','Q25','Q26','Q70','Q71','Q81','Q82','Q100','Q103','Q106','Q110'],
  Movil: ['Q27', 'Q28', 'Q29', 'Q30','Q31','Q32','Q33','Q34','Q35','Q37'],
  Pruebas: ['Q107', 'Q108']
};

app.get('/area/:nombre/estado', async (req, res) => {
  const area = req.params.nombre;
  const colas = colaPorArea[area];

  if (!colas) {
    return res.status(400).json({ error: 'Área no válida. Usa Retencion, Tramites o Soporte.' });
  }

  try {
    const extensionesMap = new Map();

    for (const cola of colas) {
      const response = await new Promise((resolve, reject) => {
        ami.action({ action: 'Command', command: `queue show ${cola}` }, (err, resp) => {
          if (err) return reject(err);
          resolve(extractOutput(resp));
        });
      });

      const bloques = response.split(',,');
      for (const bloque of bloques) {
        const membersSection = bloque.split('Members:')[1];
        if (!membersSection) continue;

        const miembros = membersSection.split(',');
        for (let m of miembros) {
          m = m.trim();
          if (m.includes('Unavailable')) continue;

          const extMatch = m.match(/SIP\/(\d+)/);
          if (!extMatch) continue;

          const extension = extMatch[1];
          if (extensionesMap.has(extension)) continue;

          let estado = 'unknown';
          if (m.includes('Busy')) estado = 'Busy';
          else if (m.includes('On Hold')) estado = 'On Hold';
          else if (m.includes('In call')) estado = 'In call';
          else if (m.includes('Ringing')) estado = 'Ringing';
          else if (m.includes('Not in use')) estado = 'Not in use';

          extensionesMap.set(extension, estado);
        }
      }
    }

    const resumen = {
      area,
      total: extensionesMap.size,
      'Busy': 0,
      'On Hold': 0,
      'In call': 0,
      'Ringing': 0,
      'Not in use': 0,
      'unknown': 0
    };

    for (const estado of extensionesMap.values()) {
      if (resumen.hasOwnProperty(estado)) {
        resumen[estado]++;
      } else {
        resumen.unknown++;
      }
    }

    res.json(resumen);
  } catch (err) {
    console.error('Error:', err);
    res.status(500).json({ error: 'Error al consultar el estado de los agentes', details: err });
  }
});

app.listen(port, () => {
  console.log(`API resumen de estado por área escuchando en http://localhost:${port}`);
});

