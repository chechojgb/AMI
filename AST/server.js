//const ami = new AsteriskManager(5038, '127.0.0.1', 'SoulPhone', 'ResItcHiNGEn**', true);
//2025-02-13 **Se crean funciones para agregar una extensión a varias colas desde el endpoint /queue/add, /queue/remove y /queue/pause.
//2025-02-14 **/queue/add = Se agrega parametro para agregar el dato del usuario a la cola.
//2025-02-14 **/queue/pause = Se agrega la razón de la pausa. 

const express = require('express');
const AsteriskManager = require('asterisk-manager');

const app = express();
const port = 3000;

app.use(express.json());

const ami = new AsteriskManager(5038, '172.17.8.100', 'SoulPhone', 'ResItcHiNGEn**', true);
//const ami = new AsteriskManager(5038, '10.57.251.179', 'SoulPhone', 'ResItcHiNGEn**', true);

ami.keepConnected();

ami.on('connect', () => {
  console.log('Conectado al AMI');
});

ami.on('error', (err) => {
  console.error('Error en AMI:', err);
});

/**
 * Función auxiliar para ejecutar una acción AMI para cada cola.
 * @param {string} actionName - El nombre de la acción AMI (QueueAdd, QueueRemove, QueuePause)
 * @param {array} queues - Arreglo de nombres de cola.
 * @param {string} channel - La extensión o canal (por ejemplo, SIP/2020).
 * @param {object} [extras] - Parámetros adicionales que se deben incluir en la acción.
 * @returns {Promise} Promesa que se resuelve con los resultados de cada acción.
 */
function performQueueAction(actionName, queues, channel, extras) {
  const actions = queues.map(queue => {
    return new Promise((resolve) => {
      let params = {
        action: actionName,
        queue: queue,
        interface: channel
      };

      if (extras) {
        Object.assign(params, extras);
      }

      ami.action(params, (err, response) => {
        if (err) {
          return resolve({ queue, success: false, error: err });
        } else {
          return resolve({ queue, success: true, response });
        }
      });
    });
  });
  return Promise.all(actions);
}

/**
 * Endpoint para agregar una extensión a múltiples colas.
 * Método: POST
 * Ruta: /queue/add
 * Body esperado:
 * {
 *   "queues": ["Q1", "Q2", "Q4"],
 *   "interface": "SIP/2020",
 *   "membername": "Agente 1"  // parámetro opcional
 * }
 */
app.post('/queue/add', async (req, res) => {
  const { queues, interface: channel, membername } = req.body;
  if (!queues || !Array.isArray(queues) || !channel) {
    return res.status(400).json({ error: 'Faltan parámetros: queues (array) e interface son requeridos' });
  }
  
  let extras = {};
  if (membername) {
    extras.membername = membername;
  }

  try {
    const results = await performQueueAction('QueueAdd', queues, channel, extras);
    return res.json({ 
      message: `Acción QueueAdd ejecutada para ${channel} en colas: ${queues.join(', ')}${membername ? ` con membername: ${membername}` : ''}`, 
      results 
    });
  } catch (e) {
    return res.status(500).json({ error: 'Error al ejecutar QueueAdd', details: e });
  }
});

/**
 * Endpoint para eliminar una extensión de múltiples colas.
 * Método: POST (o DELETE, según tu preferencia)
 * Ruta: /queue/remove
 * Body esperado:
 * {
 *   "queues": ["Q1", "Q2", "Q4"],
 *   "interface": "SIP/2020"
 * }
 */
app.post('/queue/remove', async (req, res) => {
  const { queues, interface: channel } = req.body;
  if (!queues || !Array.isArray(queues) || !channel) {
    return res.status(400).json({ error: 'Faltan parámetros: queues (array) e interface son requeridos' });
  }
  try {
    const results = await performQueueAction('QueueRemove', queues, channel);
    return res.json({ 
      message: `Acción QueueRemove ejecutada para ${channel} en colas: ${queues.join(', ')}`, 
      results 
    });
  } catch (e) {
    return res.status(500).json({ error: 'Error al ejecutar QueueRemove', details: e });
  }
});

/**
 * Endpoint para pausar o reanudar una extensión en múltiples colas.
 * Método: POST
 * Ruta: /queue/pause
 * Body esperado:
 * {
 *   "queues": ["Q1", "Q2", "Q4"],
 *   "interface": "SIP/2020",
 *   "paused": 1,          // 1 para pausar, 0 para reanudar
 *   "reason": "Almuerzo"  // parámetro opcional para registrar el motivo
 * }
 */
app.post('/queue/pause', async (req, res) => {
  const { queues, interface: channel, paused, reason } = req.body;
  if (!queues || !Array.isArray(queues) || !channel || paused === undefined) {
    return res.status(400).json({ error: 'Faltan parámetros: queues (array), interface y paused son requeridos' });
  }
  
  const extraParams = { paused };
  if (reason) {
    extraParams.reason = reason;
  }

  try {
    const results = await performQueueAction('QueuePause', queues, channel, extraParams);
    const estado = paused == 1 ? 'pausada' : 'reanudad';
    return res.json({ 
      message: `Acción QueuePause ejecutada para ${channel} (${estado}) en colas: ${queues.join(', ')}${reason ? ` con motivo: ${reason}` : ''}`, 
      results 
    });
  } catch (e) {
    return res.status(500).json({ error: 'Error al ejecutar QueuePause', details: e });
  }
});

app.listen(port, () => {
  console.log(`API escuchando en http://localhost:${port}`);
});

const fs = require('fs');

app.get('/channel/status/:extension', (req, res) => {
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

    // Se obtiene el output considerando varias propiedades
    let output = (typeof response === 'string')
      ? response
      : (response.output || response.message || response.content || '');
    console.log('Output procesado:', output);

    // Escribir el output en un archivo para depuración
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
        // Separa la línea en tokens utilizando espacios (uno o más)
        const tokens = line.trim().split(/\s+/);
        console.log('Tokens extraídos:', tokens);
        if (tokens.length >= 2) {
          // Se asume que los dos últimos tokens corresponden a Accountcode y PeerAccount
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

/**
 * Endpoint para pausar o reanudar una extensión en múltiples colas.
 * Método: POST
 * Ruta: /queue/pause
 * Body esperado:
 * {
 *   "queues": ["Q1", "Q2", "Q4"],
 *   "interface": "SIP/2020",
 *   "paused": 1,          // 1 para pausar, 0 para reanudar
 *   "reason": "Almuerzo"  // parámetro opcional para registrar el motivo
 * }
 */

app.get('/channel/hangup2/:extension', (req, res) => {
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
    
    // Se obtiene la salida del comando
    let output = (typeof response === 'string')
      ? response
      : (response.output || response.message || response.content || '');
    console.log('Output procesado:', output);

    const lines = output.split('\n');
    let hangupChannels = [];

    lines.forEach(line => {
      if (!line.trim()) return;
      if (line.trim().startsWith('SIP/')) {
        // Separamos la línea en tokens (las columnas están separadas por espacios)
        const tokens = line.trim().split(/\s+/);
        // Suponemos que:
        // tokens[0] = nombre del canal
        // tokens[5] = Application (por ejemplo, "Queue" o "AppQueue")
        // tokens[tokens.length - 2] = Accountcode (donde se encuentra la extensión)
        const channelName = tokens[0];
        const application = tokens[5] || '';
        const accountcode = tokens[tokens.length - 2] || '';
        
        // Verificamos que la línea corresponde a la extensión
        if (accountcode === extension) {
          console.log(`Canal ${channelName} tiene Accountcode ${accountcode} y Application ${application}`);
          // Si la aplicación es "Queue" (asumiendo que esa es la llamada pegada)
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

/**
 * Metodo:
 * Ruta: /extension/3001/status
 * Ejemplo de respuesta si la extensión está logueada:
 * {
 *   "extension": "3001",
 *   "logged": true,
 *   "queues": ["Q1", "Q2"],
 *   "message": "La extensión está logueada y se encuentra en las colas especificadas."
 * }
 *
 * Ejemplo de respuesta si la extensión no está logueada:
 * {
 *   "extension": "3001",
 *   "logged": false,
 *   "queues": [],
 *   "message": "La extensión no está logueada."
 * }
 */

app.get('/extension/:extension/status', (req, res) => {
  const { extension } = req.params;
  console.log(`Consultando estado de la extensión: ${extension}`);

  // Promesa para determinar si la extensión está registrada (logueada)
  const getRegistrationStatus = new Promise((resolve, reject) => {
    ami.action({
      action: 'Command',
      command: 'sip show peers'
    }, (err, response) => {
      if (err) {
        console.error('Error al ejecutar sip show peers:', err);
        return reject(err);
      }
      // Log de depuración para ver las propiedades del response
      console.log('Propiedades de response (sip show peers):', Object.keys(response));
      console.log('Response completo (sip show peers):', response);

      // Se obtiene el output desde alguna de las propiedades posibles
      let output = (typeof response === 'string')
        ? response
        : (response.output || response.message || response.content || response.data || '');
      console.log('Output de sip show peers:', output);

      // Separa el output en líneas y busca la línea correspondiente a la extensión.
      // Se asume que la línea del peer inicia con "extension/extension".
      const lines = output.split('\n');
      let logged = false;
      for (let line of lines) {
        line = line.trim();
        if (line.startsWith(`${extension}/`)) {
          // Si la línea contiene "OK" se considera que está registrada.
          if (line.includes('OK')) {
            logged = true;
          }
          break;
        }
      }
      resolve(logged);
    });
  });

  // Promesa para obtener las colas a las que pertenece la extensión
  const getQueues = new Promise((resolve, reject) => {
    ami.action({
      action: 'Command',
      command: 'queue show'
    }, (err, response) => {
      if (err) {
        console.error('Error al ejecutar queue show:', err);
        return reject(err);
      }
      // Log de depuración para ver las propiedades del response
      console.log('Propiedades de response (queue show):', Object.keys(response));
      console.log('Response completo (queue show):', response);

      let output = (typeof response === 'string')
        ? response
        : (response.output || response.message || response.content || response.data || '');
      console.log('Output de queue show:', output);

      const lines = output.split('\n');
      let queues = [];
      let currentQueue = null;

      // Buscamos las líneas que contengan "SIP/<extension>" o "(SIP/<extension>)" y extraemos el nombre de la cola
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




