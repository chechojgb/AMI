const express = require('express');
const { ami } = require('../amiConnection');
const router = express.Router();

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

router.post('/add', async (req, res) => {
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

router.post('/remove', async (req, res) => {
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

router.post('/pause', async (req, res) => {
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

module.exports = router;
