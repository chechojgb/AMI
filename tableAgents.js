const express = require('express');
const AsteriskManager = require('asterisk-manager');

const app = express();
const port = 3002;

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

app.get('/area/:nombre', async (req, res) => {
  const area = req.params.nombre;
  const colas = colaPorArea[area];

  if (!colas) {
    return res.status(400).json({ error: 'Área no válida. Usa Retencion, Tramites o Soporte.' });
  }

  try {
    const resultados = new Map();

    const channelLines = await new Promise((resolve, reject) => {
      ami.action({ action: 'Command', command: 'core show channels verbose' }, (err, response) => {
        if (err) return reject(err);
        const output = extractOutput(response);
        const lines = output.split(',').map(line => line.trim()).filter(line => line.startsWith('SIP/'));
        resolve(lines);
      });
    });

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

          // ✅ Nombre: lo que está antes de "(SIP/xxxx)"
          const nombreMatch = m.match(/^(.+?)\s+\(SIP\/\d+/i);
          const nombre = nombreMatch ? nombreMatch[1].trim() : extension;

          const estadoMatch = m.match(/\(([^)]+)\)/g);
          const estado = estadoMatch ? estadoMatch.map(e => e.replace(/[()]/g, '')).find(e =>
            ['Busy', 'On Hold', 'In call', 'Ringing', 'Not in use'].includes(e)
          ) : 'Unknown';

          const pausaMatch = m.match(/paused:[^)]+/i);
          const pausa = pausaMatch ? pausaMatch[0] : null;

          const loginMatch = m.match(/login was (\d+) secs ago/i);
          const lastCallMatch = m.match(/last was (\d+) secs ago/i);

          const inCall = /(Busy|in call|On Hold)/i.test(m);

          let accountcode = null;
          let durationSecs = null;

          for (let line of channelLines) {
            if (line.includes(`SIP/${extension}-`)) {
              const timeMatch = line.match(/\b\d{2}:\d{2}:\d{2}\b/);
              if (timeMatch) {
                accountcode = timeMatch[0];
                const parts = accountcode.split(':').map(Number);
                if (parts.length === 3) {
                  durationSecs = parts[0] * 3600 + parts[1] * 60 + parts[2];
                }
              }
              break;
            }
          }

          const existing = resultados.get(extension) || {
            extension,
            cola,
            member: null,
            member2: null,
            inCall: false,
            loginSecs: null,
            lastCallSecs: null,
            accountcode: null,
            durationSecs: null
          };

          const memberData = {
            nombre,
            estado,
            pausa
          };

          const esPausa = m.includes('paused:');

          if (esPausa && !existing.member2) {
            existing.member2 = memberData;
          }

          if (!esPausa && !existing.member) {
            existing.member = memberData;
          }

          // ✅ Si solo hay una línea (aunque esté en pausa), la usamos como member también
          if (!existing.member) {
            existing.member = memberData;
          }

          if (inCall) existing.inCall = true;
          if (loginMatch) existing.loginSecs = parseInt(loginMatch[1]);
          if (lastCallMatch) existing.lastCallSecs = parseInt(lastCallMatch[1]);

          if (!existing.accountcode && accountcode) {
            existing.accountcode = accountcode;
            existing.durationSecs = durationSecs;
          }

          resultados.set(extension, existing);
        }
      }
    }

    res.json(Array.from(resultados.values()));
  } catch (err) {
    console.error('Error:', err);
    res.status(500).json({ error: 'Error al consultar información de las colas', details: err });
  }
});

app.listen(port, () => {
  console.log(`API de agentes por área escuchando en http://localhost:${port}`);
});

