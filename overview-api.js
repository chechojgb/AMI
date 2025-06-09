const express = require('express');
const AsteriskManager = require('asterisk-manager');

const app = express();
const port = 3007;

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

app.get('/extensions/overview', (req, res) => {
  Promise.all([
    new Promise((resolve, reject) => {
      ami.action({ action: 'Command', command: 'core show channels verbose' }, (err, response) => {
        if (err) return reject(err);
        const output = extractOutput(response);
        const lines = output.split(',').map(line => line.trim()).filter(line => line.startsWith('SIP/'));
        resolve(lines);
      });
    }),
    new Promise((resolve, reject) => {
      ami.action({ action: 'Command', command: 'queue show' }, (err, response) => {
        if (err) return reject(err);
        const output = extractOutput(response);
        resolve(output.split(/,,/));
      });
    })
  ])
  .then(([channelLines, queueBlocks]) => {
    const extensionsSet = new Set();

    // Buscar extensiones únicas
    for (let line of channelLines) {
      const match = line.match(/SIP\/(\d+)-/);
      if (match) {
        extensionsSet.add(match[1]);
        if (extensionsSet.size >= 6) break;
      }
    }

    const extensions = Array.from(extensionsSet);
    const results = [];

    extensions.forEach(extension => {
      let accountcode = null;
      let durationSecs = null;
      let member = null;
      let inCall = false;
      let loginSecs = null;
      let lastCallSecs = null;

      // Buscar línea del canal activo
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

      // Buscar en queue show
      for (let block of queueBlocks) {
        const membersSection = block.split('Members:')[1];
        if (!membersSection) continue;
        const members = membersSection.split(',');
        for (let m of members) {
          m = m.trim();
          if (m.includes(`SIP/${extension}`)) {
            member = m;
            if (/(Busy|in call)/i.test(m)) inCall = true;

            const loginMatch = m.match(/login was (\d+) secs ago/i);
            if (loginMatch) loginSecs = parseInt(loginMatch[1]);

            const lastCallMatch = m.match(/last was (\d+) secs ago/i);
            if (lastCallMatch) lastCallSecs = parseInt(lastCallMatch[1]);
            break;
          }
        }
        if (member) break;
      }

      results.push({
        extension,
        accountcode,
        durationSecs,
        member,
        inCall,
        loginSecs,
        lastCallSecs
      });
    });

    res.json(results);
  })
  .catch(err => {
    console.error('Error:', err);
    res.status(500).json({ error: 'Error al procesar extensiones', details: err });
  });
});

app.listen(port, () => {
  console.log(`API escuchando en http://localhost:${port}`);
});

