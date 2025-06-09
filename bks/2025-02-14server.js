//const ami = new AsteriskManager(5038, '127.0.0.1', 'SoulPhone', 'ResItcHiNGEn**', true);
//2025-02-13 **Se crean funciones para agregar una extensión a varias colas desde el endpoint /queue/add, /queue/remove y /queue/pause.
//2025-02-14 **/queue/add = Se agrega parametro para agregar el dato del usuario a la cola.
//2025-02-14 **/queue/pause = Se agrega la razón de la pausa. 


const express = require('express');
const AsteriskManager = require('asterisk-manager');

const app = express();
const port = 3000;

// Middleware para parsear JSON en el body de las solicitudes
app.use(express.json());

// Conexión al AMI: puerto, host, usuario, contraseña y autoReconnect
const ami = new AsteriskManager(5038, '127.0.0.1', 'SoulPhone', 'ResItcHiNGEn**', true);
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
 * @param {number} paused - (Opcional) Valor para la acción QueuePause (1 para pausar, 0 para reanudar).
 * @returns {Promise} Promesa que se resuelve con los resultados de cada acción.
 */
function performQueueAction(actionName, queues, channel, paused) {
  // Para cada cola, creamos una promesa que ejecuta la acción
  const actions = queues.map(queue => {
    return new Promise((resolve) => {
      let params = {
        action: actionName,
        queue: queue,
        interface: channel
      };
      if (actionName === 'QueuePause') {
        params.paused = paused;
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
 *   "interface": "SIP/2020"
 * }
 */
app.post('/queue/add', async (req, res) => {
  const { queues, interface: channel } = req.body;
  if (!queues || !Array.isArray(queues) || !channel) {
    return res.status(400).json({ error: 'Faltan parámetros: queues (array) e interface son requeridos' });
  }
  try {
    const results = await performQueueAction('QueueAdd', queues, channel);
    return res.json({ 
      message: `Acción QueueAdd ejecutada para ${channel} en colas: ${queues.join(', ')}`, 
      results 
    });
  } catch (e) {
    return res.status(500).json({ error: 'Error al ejecutar QueueAdd', details: e });
  }
});

/**
 * Endpoint para eliminar una extensión de múltiples colas.
 * Método: DELETE
 * Ruta: /queue/remove
 * Body esperado:
 * {
 *   "queues": ["Q1", "Q2", "Q4"],
 *   "interface": "SIP/2020"
 * }
 */
app.delete('/queue/remove', async (req, res) => {
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
 *   "paused": 1   // 1 para pausar, 0 para reanudar
 * }
 */
app.post('/queue/pause', async (req, res) => {
  const { queues, interface: channel, paused } = req.body;
  if (!queues || !Array.isArray(queues) || !channel || paused === undefined) {
    return res.status(400).json({ error: 'Faltan parámetros: queues (array), interface y paused son requeridos' });
  }
  try {
    const results = await performQueueAction('QueuePause', queues, channel, paused);
    const estado = paused == 1 ? 'pausada' : 'reanudad';
    return res.json({ 
      message: `Acción QueuePause ejecutada para ${channel} (${estado}) en colas: ${queues.join(', ')}`, 
      results 
    });
  } catch (e) {
    return res.status(500).json({ error: 'Error al ejecutar QueuePause', details: e });
  }
});

// Iniciar el servidor API
app.listen(port, () => {
  console.log(`API escuchando en http://localhost:${port}`);
});
