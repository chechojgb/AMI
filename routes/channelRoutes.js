const express = require('express');
const { ami } = require('../amiConnection');
const fs = require('fs');
const router = express.Router();

router.get('/status/:extension', (req, res) => {
  const { extension } = req.params;
  console.log(`Consultando estado del canal para la extensión: ${extension}`);

  ami.action({
    action: 'Command',
    command: 'core show channels verbose'
  }, (err, response) => {
    if (err) {
      console.error('Error al ejecutar comando de canales:', err);
      return res.status(500).json({ error: 'Error al consultar canales', details: err });
    }

    console.log('Respuesta completa AMI:', response);

    let output = (typeof response === 'string')
      ? response
      : (response.output || response.message || response.content || '');
    console.log('Output procesado:', output);

    fs.writeFile('channel_output.txt', output, (err) => {
      if (err) {
        console.error('Error al escribir el archivo:', err);
      } else {
        console.log('El output se ha escrito en channel_output.txt');
      }
    });

    const lines = output.split('\n');
    let matchingChannels = [];

    lines.forEach(line => {
      if (!line.trim()) return;
      if (line.trim().startsWith('SIP/')) {
        const tokens = line.trim().split(/\s+/);
        console.log('Tokens extraídos:', tokens);
        if (tokens.length >= 2) {
          const accountcode = tokens[tokens.length - 2];
          const peeraccount = tokens[tokens.length - 1];
          console.log(`Comparando para la extensión ${extension}: accountcode=${accountcode}, peeraccount=${peeraccount}`);
          if (accountcode === extension || peeraccount === extension) {
            matchingChannels.push(line);
            console.log('Canal coincidente agregado:', line);
          }
        }
      }
    });

    console.log('Canales coincidentes encontrados:', matchingChannels);

    if (matchingChannels.length > 0) {
      res.json({
        extension,
        active: true,
        channels: matchingChannels
      });
    } else {
      res.json({
        extension,
        active: false,
        message: 'No hay canales activos para esta extensión'
      });
    }
  });
});

router.get('/hangup2/:extension', (req, res) => {
  const { extension } = req.params;
  console.log(`Iniciando proceso de hangup para la extensión: ${extension}`);

  ami.action({
    action: 'Command',
    command: 'core show channels verbose'
  }, (err, response) => {
    if (err) {
      console.error('Error al ejecutar comando de canales:', err);
      return res.status(500).json({ error: 'Error al consultar canales', details: err });
    }
    
    let output = (typeof response === 'string')
      ? response
      : (response.output || response.message || response.content || '');
    console.log('Output procesado:', output);

    const lines = output.split('\n');
    let hangupChannels = [];

    lines.forEach(line => {
      if (!line.trim()) return;
      if (line.trim().startsWith('SIP/')) {
        const tokens = line.trim().split(/\s+/);
        const channelName = tokens[0];
        const application = tokens[5] || '';
        const accountcode = tokens[tokens.length - 2] || '';
        
        if (accountcode === extension) {
          console.log(`Canal ${channelName} tiene Accountcode ${accountcode} y Application ${application}`);
          if (application === 'Queue') {
            hangupChannels.push(channelName);
            console.log('Canal pegado identificado para hangup:', channelName);
          }
        }
      }
    });

    console.log('Canales a colgar identificados:', hangupChannels);

    if (hangupChannels.length > 0) {
      let hangupResults = [];
      let pending = hangupChannels.length;
      hangupChannels.forEach(channelName => {
        console.log('Enviando hangup para el canal:', channelName);
        ami.action({ action: 'Hangup', channel: channelName }, (err, response) => {
          if (err) {
            console.error('Error al enviar hangup para el canal', channelName, err);
            hangupResults.push({ channel: channelName, success: false, error: err });
          } else {
            console.log('Hangup enviado para canal', channelName, response);
            hangupResults.push({ channel: channelName, success: true, response });
          }
          pending--;
          if (pending === 0) {
            res.json({
              extension,
              hangupResults,
              message: 'Proceso de hangup completado. Se colgaron los canales identificados como pegados.'
            });
          }
        });
      });
    } else {
      res.json({
        extension,
        message: 'No se encontraron canales pegados para colgar.'
      });
    }
  });
});

module.exports = router;
