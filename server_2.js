//const ami = new AsteriskManager(5038, '127.0.0.1', 'SoulPhone', 'ResItcHiNGEn**', true);
//2025-02-13 **Se crean funciones para agregar una extensión a varias colas desde el endpoint /queue/add, /queue/remove y /queue/pause.
//2025-02-14 **/queue/add = Se agrega parametro para agregar el dato del usuario a la cola.
//2025-02-14 **/queue/pause = Se agrega la razón de la pausa. 

const express = require('express');
const AsteriskManager = require('asterisk-manager');

const app = express();
const port = 3000;

app.use(express.json());

//const ami = new AsteriskManager(5038, '172.17.8.100', 'SoulPhone', 'ResItcHiNGEn**', true);
const ami = new AsteriskManager(5038, '10.57.251.179', 'SoulPhone', 'ResItcHiNGEn**', true);

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
 * Endpoint para eliminar una extensión de múltiples colas, intentar actualizar su registro y recargar el canal SIP.
 * Método: POST
 * Ruta: /queue/remove2
 * Body esperado:
 * {
 *   "queues": ["Q1", "Q2", "Q4"],
 *   "interface": "SIP/2020"
 * }
 */
app.post('/queue/remove2', async (req, res) => {
  const { queues, interface: channel } = req.body;

  if (!queues || !Array.isArray(queues) || !channel) {
    return res.status(400).json({
      error: 'Faltan parámetros: queues (array) e interface son requeridos'
    });
  }

  try {
    // 1. Eliminamos la extensión de las colas especificadas.
    const queueRemovalResult = await performQueueAction('QueueRemove', queues, channel);

    // 2. Intento de "desregistro" (sólo aplica si usas chan_sip)
    let unregisterResult = null;
    // Nota: en Asterisk 16 con pjsip no existe el comando "sip unregister"
    if (channel.startsWith('SIP/')) {
      unregisterResult = await executeAMICommand(`sip unregister ${channel}`);
    } else {
      unregisterResult = { message: 'No se aplica desregistro forzado en pjsip' };
    }

    // 3. Recargar la configuración del canal
    // Usa el comando correspondiente según el canal en uso.
    let reloadCommand = 'sip reload';
    if (!channel.startsWith('SIP/')) {
      // Se asume que si no es chan_sip es pjsip.
      reloadCommand = 'pjsip reload';
    }
    const reloadResult = await executeAMICommand(reloadCommand);

    return res.json({
      message: `Para ${channel} se ejecutaron: eliminación de colas (${queues.join(', ')}), intento de desregistro y recarga de canal.`,
      results: {
        queueRemoval: queueRemovalResult,
        unregister: unregisterResult,
        reload: reloadResult
      }
    });
  } catch (error) {
    console.error('Error en la ejecución de acciones en Asterisk:', error);
    return res.status(500).json({
      error: 'Error al ejecutar las acciones en Asterisk',
      details: error.message || error
    });
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
 * Enlistar la cantidad de colas que tiene una extensión.
 * Método: GET
 * Ruta: /queue/pause
 * Body esperado:
 * {
 *  "extension": "2594",
 *  "logged": false,
 *  "queues": [
 *      "Q16",
 *      "Q23",
 *      "Q5"
 *   ],
 *  "message": "La extensión no está logueada."
 * }
 * 
 */

app.get('/extension/:extension/status', (req, res) => {
  const { extension } = req.params;
  console.log(`Consultando estado de la extensión: ${extension}`);

  // Función para extraer el output y asegurarse de que sea una cadena
  const extractOutput = (response) => {
    let output =
      typeof response === 'string'
        ? response
        : (response.output ||
           response.message ||
           response.content ||
           response.data ||
           '');
    if (typeof output !== 'string') {
      output = output.toString();
    }
    return output;
  };

  // Promesa para determinar si la extensión está registrada (logueada) usando "sip show peer <extension>"
  const getRegistrationStatus = new Promise((resolve, reject) => {
    ami.action(
      {
        action: 'Command',
        command: `sip show peer ${extension}`
      },
      (err, response) => {
        if (err) {
          console.error('Error al ejecutar sip show peer:', err);
          return reject(err);
        }
        let output = extractOutput(response);
        console.log('Output de sip show peer:', output);
        // Se asume que el output contiene "OK" cuando la extensión está registrada
        const logged = output.includes('OK');
        resolve(logged);
      }
    );
  });

  // Promesa para obtener las colas en las que está la extensión usando el output de "queue show"
  const getQueues = new Promise((resolve, reject) => {
    ami.action(
      {
        action: 'Command',
        command: 'queue show'
      },
      (err, response) => {
        if (err) {
          console.error('Error al ejecutar queue show:', err);
          return reject(err);
        }
        let output = extractOutput(response);
        console.log('Output de queue show:', output);

        let queues = [];
        // Si el output inicia con "Output de queue show:" lo removemos
        output = output.replace(/^Output de queue show:\s*/, '');
        // Dividimos el output en bloques usando ",," como separador
        const blocks = output.split(',,');
        // Expresión regular para extraer el encabezado de cada cola (por ejemplo, "Q10")
        const headerRegex = /^(Q\d+)/;
        // Expresión regular para buscar la presencia de la extensión en formato SIP/<extension>
        const memberRegex = new RegExp(`SIP\\/${extension}\\b`, 'i');

        blocks.forEach((block) => {
          block = block.trim();
          let headerMatch = block.match(headerRegex);
          if (headerMatch) {
            let queueName = headerMatch[1];
            if (memberRegex.test(block)) {
              console.log(`La extensión ${extension} se encontró en la cola ${queueName}`);
              if (!queues.includes(queueName)) {
                queues.push(queueName);
              }
            }
          }
        });
        resolve(queues);
      }
    );
  });

  Promise.all([getRegistrationStatus, getQueues])
    .then(([logged, queues]) => {
      res.json({
        extension,
        logged,
        queues,
        message: logged
          ? `La extensión está logueada${queues.length > 0 ? ` y se encuentra en la(s) cola(s): ${queues.join(', ')}` : ''}.`
          : 'La extensión no está logueada.'
      });
    })
    .catch((err) => {
      res.status(500).json({
        error: 'Error al consultar el estado de la extensión',
        details: err
      });
    });
});

/**
 * Enlistar la cantidad de colas que tiene una extensión.
 * Método: GET
 * Ruta: /queue/pause
 * Body esperado:
 * {
 *  "extension": "2594",
 *  "logged": false,
 *  "queues": [
 *      "Q16",
 *      "Q23",
 *      "Q5"
 *   ],
 *  "message": "La extensión no está logueada."
 * }
 *
 */


app.get('/extension/:extension/status2', (req, res) => { 
  const { extension } = req.params;
  console.log(`Consultando estado de la extensión: ${extension}`);

  // Función para extraer el output y asegurarse de que sea una cadena
  const extractOutput = (response) => {
    let output = (typeof response === 'string')
      ? response
      : (response.output || response.message || response.content || response.data || '');
    if (typeof output !== 'string') {
      output = output.toString();
    }
    return output;
  };

  // Promesa para determinar si la extensión está registrada (sip show peers)
  const getRegistrationStatus = new Promise((resolve, reject) => {
    ami.action({
      action: 'Command',
      command: 'sip show peers'
    }, (err, response) => {
      if (err) {
        console.error('Error al ejecutar sip show peers:', err);
        return reject(err);
      }
      console.log('Response completo (sip show peers):', response);
      let output = extractOutput(response);
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

  // Promesa para obtener las colas y extraer la información adicional para la extensión
  const getQueues = new Promise((resolve, reject) => {
    ami.action({
      action: 'Command',
      command: 'queue show'
    }, (err, response) => {
      if (err) {
        console.error('Error al ejecutar queue show:', err);
        return reject(err);
      }
      console.log('Response completo (queue show):', response);
      let output = extractOutput(response);
      console.log('Output de queue show:', output);

      // Dividir el output en bloques utilizando el delimitador ",,"
      let queueBlocks = output.split(/,,/);
      let queues = [];

      queueBlocks.forEach(block => {
        block = block.trim();
        // Validar que el bloque contenga un encabezado de cola (por ejemplo: "Q1 has")
        let queueMatch = block.match(/^(Q\d+)\s+has/);
        if (!queueMatch) return;
        let queueName = queueMatch[1];

        // Extraer la sección de miembros a partir de "Members:"
        let membersSection = block.split('Members:')[1];
        if (!membersSection) return;
        // Los miembros se separan por comas
        let members = membersSection.split(',');
        members.forEach(member => {
          member = member.trim();
          // Si el miembro contiene la extensión buscada (por ejemplo "SIP/2209")
          if (member.includes(`SIP/${extension}`)) {
            // Extraer información de pausa (si existe)
            let pausedMatch = member.match(/\(paused:([^)]+)\)/);
            let paused = pausedMatch ? pausedMatch[1].trim() : null;

            // Determinar el estado de uso/disponibilidad
            let usage = null;
            if (member.includes('(Unavailable)')) {
              usage = 'Unavailable';
            } else if (member.includes('(Not in use)')) {
              usage = 'Not in use';
            } else if (member.includes('(On Hold)')) {
              usage = 'On Hold';
            } else if (member.includes('(in call)')) {
              usage = 'in call';
            } else if (member.includes('(Busy)')) {
              usage = 'Busy';
            }

            // Se puede incluir información adicional, por ejemplo el nombre del miembro
            queues.push({ queue: queueName, paused, usage, member });
          }
        });
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
          ? 'La extensión está logueada y se encontró en las colas con los siguientes detalles.'
          : 'La extensión no está logueada.'
      });
    })
    .catch(err => {
      res.status(500).json({ error: 'Error al consultar el estado de la extensión', details: err });
    });
});

/**
 * Ruta para colgar una llamada pegada. 
 * Método: GET
 * Ruta: /queue/pause
 * Body esperado:
 * {
 *  "extension": "2594",
 *  "logged": false,
 *  "queues": [
 *      "Q16",
 *      "Q23",
 *      "Q5"
 *   ],
 *  "message": "La extensión no está logueada."
 * }
 *
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


//COLGAR
//
//

// Endpoint para obtener los canales que coincidan con la extensión

app.get('/channels/:extension', (req, res) => {
  const { extension } = req.params;
  console.log(`Buscando canales para la extensión: ${extension}`);

  ami.action({
    action: 'Command',
    command: 'core show channels verbose'
  }, (err, response) => {
    if (err) {
      console.error('Error al ejecutar comando de canales:', err);
      return res.status(500).json({ error: 'Error al consultar canales', details: err });
    }

    // Extrae la salida del comando. Puede venir como string o array.
    let output = (typeof response === 'string')
      ? response
      : (response.output || response.message || response.content || '');
    console.log('Output procesado:', output);

    // Si la salida es un array, la usamos directamente; si es string, la separamos en líneas.
    let lines = [];
    if (Array.isArray(output)) {
      lines = output;
    } else if (typeof output === 'string') {
      lines = output.split('\n');
    }

    let foundChannels = [];

    lines.forEach(line => {
      if (!line.trim()) return;
      if (line.trim().startsWith('SIP/')) {
        // Separamos la línea en tokens (asumimos que las columnas están separadas por espacios)
        const tokens = line.trim().split(/\s+/);
        const channelName = tokens[0];
        // Se asume que las tres últimas columnas son: Accountcode, PeerAccount y BridgeID
        if (tokens.length >= 3) {
          const accountcode = tokens[tokens.length - 3].trim();
          const peeraccount = tokens[tokens.length - 2].trim();
          console.log(`Canal ${channelName} - Accountcode: ${accountcode}, PeerAccount: ${peeraccount}`);
          if (accountcode === extension || peeraccount === extension) {
            foundChannels.push({
              channel: channelName,
              accountcode,
              peeraccount
            });
          }
        }
      }
    });

    console.log('Canales encontrados:', foundChannels);
    res.json({ extension, channels: foundChannels });
  });
});

// Endpoint para colgar un canal específico
app.post('/channel/hangup', (req, res) => {
  // Se espera que el body contenga { "channel": "nombre_del_canal" }
  const { channel } = req.body;
  if (!channel) {
    return res.status(400).json({ error: 'Debe enviar un canal en el cuerpo de la solicitud' });
  }
  console.log(`Enviando hangup para el canal: ${channel}`);

  ami.action({ action: 'Hangup', channel }, (err, response) => {
    if (err) {
      console.error('Error al enviar hangup para el canal', channel, err);
      return res.status(500).json({ error: 'Error al enviar hangup', details: err });
    }
    console.log('Hangup enviado para canal', channel, response);
    res.json({ channel, result: response, message: 'Hangup enviado correctamente' });
  });
});


