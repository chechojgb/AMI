const express = require('express');
const { ami } = require('../amiConnection');
const router = express.Router();

router.get('/:extension/status', (req, res) => {
  const { extension } = req.params;
  console.log(`Consultando estado de la extensión: ${extension}`);

  const getRegistrationStatus = new Promise((resolve, reject) => {
    ami.action({
      action: 'Command',
      command: 'sip show peers'
    }, (err, response) => {
      if (err) {
        console.error('Error al ejecutar sip show peers:', err);
        return reject(err);
      }
      console.log('Propiedades de response (sip show peers):', Object.keys(response));
      console.log('Response completo (sip show peers):', response);

      let output = (typeof response === 'string')
        ? response
        : (response.output || response.message || response.content || response.data || '');
      console.log('Output de sip show peers:', output);

      const lines = output.split('\n');
      let logged = false;
      for (let line of lines) {
        line = line.trim();
        if (line.startsWith(`${extension}/`)) {
          if (line.includes('OK')) {
            logged = true;
          }
          break;
        }
      }
      resolve(logged);
    });
  });

  const getQueues = new Promise((resolve, reject) => {
    ami.action({
      action: 'Command',
      command: 'queue show'
    }, (err, response) => {
      if (err) {
        console.error('Error al ejecutar queue show:', err);
        return reject(err);
      }
      console.log('Propiedades de response (queue show):', Object.keys(response));
      console.log('Response completo (queue show):', response);

      let output = (typeof response === 'string')
        ? response
        : (response.output || response.message || response.content || response.data || '');
      console.log('Output de queue show:', output);

      const lines = output.split('\n');
      let queues = [];
      let currentQueue = null;

      lines.forEach(line => {
        line = line.trim();
        if (line.startsWith('Q')) {
          const match = line.match(/^(Q\d+)/);
          if (match) {
            currentQueue = match[1];
          }
        } else if (currentQueue && (line.includes(`SIP/${extension}`) || line.includes(`(SIP/${extension})`))) {
          if (!queues.includes(currentQueue)) {
            queues.push(currentQueue);
          }
        }
      });
      resolve(queues);
    });
  });

  Promise.all([getRegistrationStatus, getQueues])
    .then(([logged, queues]) => {
      res.json({
        extension,
        logged,
        queues,
        message: logged
          ? 'La extensión está logueada y se encuentra en las colas especificadas.'
          : 'La extensión no está logueada.'
      });
    })
    .catch(err => {
      res.status(500).json({ error: 'Error al consultar el estado de la extensión', details: err });
    });
});

module.exports = router;
