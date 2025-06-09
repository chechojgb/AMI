const express = require('express');
const AsteriskManager = require('asterisk-manager');

const app = express();
const port = 3005;

const ami = new AsteriskManager(5038, '10.57.251.179', 'SoulPhone', 'ResItcHiNGEn**', true);
ami.keepConnected();

ami.on('connect', () => console.log('✅ Conectado al AMI'));
ami.on('error', err => console.error('❌ Error AMI:', err));

const extractOutput = (response) => {
  if (typeof response === 'string') return response;
  if (Array.isArray(response.output)) return response.output.join('\n');
  if (typeof response.output === 'string') return response.output;
  if (typeof response.message === 'string') return response.message;
  return '';
};

app.get('/extension/info', (req, res) => {
  const extension = req.query.ext;

  if (!extension) {
    return res.status(400).json({ error: 'Parámetro "ext" requerido' });
  }

  console.log(`🔍 Consultando información para extensión: ${extension}`);

  Promise.all([
    new Promise((resolve, reject) => {
      ami.action({ action: 'Command', command: 'core show channels verbose' }, (err, response) => {
        if (err) return reject(err);
        resolve(extractOutput(response));
      });
    }),
    new Promise((resolve, reject) => {
      ami.action({ action: 'Command', command: 'queue show' }, (err, response) => {
        if (err) return reject(err);
        resolve(extractOutput(response));
      });
    }),
    new Promise((resolve, reject) => {
      ami.action({ action: 'Command', command: 'sip show peers' }, (err, response) => {
        if (err) return reject(err);
        resolve(extractOutput(response));
      });
    })
  ])
  .then(([channelOutput, queueOutput, peersOutput]) => {
    let duration = null;
    let durationSecs = null;
    let canal = null;
    let canalRelacionado = null;
    let member = null;
    let member2 = null;
    let inCall = false;
    let loginSecs = null;
    let lastCallSecs = null;
    let ip = null;

    const channelLines = channelOutput.split('\n').map(line => line.trim());
    console.log(`📊 Total de líneas en core show channels: ${channelLines.length}`);

    const relatedLines = channelLines.filter(line => line.includes(`SIP/${extension}`));
    if (relatedLines.length > 0) {
      console.log(`📌 Líneas que contienen SIP/${extension}:`);
      relatedLines.forEach((line, i) => console.log(`  [${i + 1}] ${line}`));
    } else {
      console.log(`⚠️ No se encontraron líneas que contengan SIP/${extension}`);
    }

    for (let line of channelLines) {
      if (line.startsWith(`SIP/${extension}-`)) {
        console.log(`✅ Línea seleccionada para análisis: ${line}`);
        canal = line.split(/\s+/)[0];
        console.log(`📡 Canal detectado: ${canal}`);

        const match = line.match(/\b\d{2}:\d{2}:\d{2}\b/);
        if (match) {
          duration = match[0];
          const [hh, mm, ss] = duration.split(':').map(Number);
          durationSecs = hh * 3600 + mm * 60 + ss;
          console.log(`⏱️ Duración encontrada: ${duration} → ${durationSecs} segundos`);
        } else {
          console.log(`❌ No se encontró duración en línea: ${line}`);
        }

        // Extraer BridgeID (último campo)
        const parts = line.trim().split(/\s+/);
        const bridgeId = parts[parts.length - 1] || null;
        if (bridgeId) {
          console.log(`🔗 BridgeID encontrado: ${bridgeId}`);
          const matchingLines = channelLines.filter(l => l.includes(bridgeId));
          for (let relatedLine of matchingLines) {
            const canalPosible = relatedLine.split(/\s+/)[0];
            if (canalPosible !== canal) {
              canalRelacionado = canalPosible;
              console.log(`🔁 Canal relacionado detectado: ${canalRelacionado}`);
              break;
            }
          }
        }

        break;
      }
    }

    const queueLines = queueOutput.split('\n');
    let foundPrimary = false;
    let foundSecondary = false;

    for (let line of queueLines) {
      const trimmed = line.trim();

      if (!foundPrimary && trimmed.includes(`SIP/${extension}`) && !trimmed.includes('paused:')) {
        console.log(`🎯 Miembro ACTIVO encontrado en queue: ${trimmed}`);
        member = trimmed;
        foundPrimary = true;

        if (/Busy|in call|On Hold/i.test(trimmed)) {
          inCall = true;
          console.log(`📞 Estado: en llamada o en espera`);
        }

        const loginMatch = trimmed.match(/login was (\d+) secs ago/i);
        if (loginMatch) {
          loginSecs = parseInt(loginMatch[1]);
          console.log(`🕓 Tiempo desde login: ${loginSecs} segundos`);
        }

        const lastCallMatch = trimmed.match(/last was (\d+) secs ago/i);
        if (lastCallMatch) {
          lastCallSecs = parseInt(lastCallMatch[1]);
          console.log(`📞 Tiempo desde última llamada: ${lastCallSecs} segundos`);
        }
      }

      if (!foundSecondary && trimmed.includes(`SIP/${extension}`) && trimmed.includes('paused:')) {
        console.log(`⏸️ Miembro EN PAUSA encontrado en queue: ${trimmed}`);
        member2 = trimmed;
        foundSecondary = true;
      }

      if (foundPrimary && foundSecondary) break;
    }

    if (!member && !member2) {
      console.log(`⚠️ No se encontró SIP/${extension} en ninguna línea de queue show`);
    }

    const peerLines = peersOutput.split('\n');
    for (let line of peerLines) {
      if (line.startsWith(`${extension}/`)) {
        const parts = line.trim().split(/\s+/);
        ip = parts[1] || null;
        console.log(`🌐 IP detectada para SIP/${extension}: ${ip}`);
        break;
      }
    }

    const result = {
      extension,
      canal,
      canalRelacionado,
      duration,
      durationSecs,
      member,
      member2,
      inCall,
      loginSecs,
      lastCallSecs,
      ip
    };

    console.log(`✅ Resultado final para extensión ${extension}:`, result);
    res.json(result);
  })
  .catch(err => {
    console.error('❌ Error al procesar solicitud:', err);
    res.status(500).json({ error: 'Error al obtener información de la extensión', details: err });
  });
});

app.listen(port, () => {
  console.log(`🚀 API escuchando en http://localhost:${port}`);
});

