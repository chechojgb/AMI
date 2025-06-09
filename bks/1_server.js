const express = require('express');
const AsteriskManager = require('asterisk-manager');

const app = express();
const port = 3000;

// Middleware para parsear JSON en el cuerpo de la solicitud
app.use(express.json());

// Conexión al AMI: puerto, host, usuario, contraseña, autoReconnect
const ami = new AsteriskManager(5038, '127.0.0.1', 'SoulPhone', 'ResItcHiNGEn**', true);
ami.keepConnected();

// Endpoint para agregar una extensión a una cola
app.post('/queue/add', (req, res) => {
  const { queue, interface: channel } = req.body;
  if (!queue || !channel) {
    return res.status(400).json({ error: 'Faltan parámetros: queue e interface son requeridos' });
  }

  ami.action({
    action: 'QueueAdd',
    queue: queue,
    interface: channel
  }, (err, response) => {
    if (err) {
      return res.status(500).json({ error: 'Error al agregar la extensión a la cola', details: err });
    }
    return res.json({ message: `Extensión ${channel} agregada a la cola ${queue}`, response });
  });
});

// Endpoint para eliminar una extensión de una cola
app.delete('/queue/remove', (req, res) => {
  const { queue, interface: channel } = req.body;
  if (!queue || !channel) {
    return res.status(400).json({ error: 'Faltan parámetros: queue e interface son requeridos' });
  }

  ami.action({
    action: 'QueueRemove',
    queue: queue,
    interface: channel
  }, (err, response) => {
    if (err) {
      return res.status(500).json({ error: 'Error al eliminar la extensión de la cola', details: err });
    }
    return res.json({ message: `Extensión ${channel} eliminada de la cola ${queue}`, response });
  });
});

// Endpoint para pausar o reanudar una extensión en una cola
app.post('/queue/pause', (req, res) => {
  const { queue, interface: channel, paused } = req.body;
  if (!queue || !channel || (paused === undefined)) {
    return res.status(400).json({ error: 'Faltan parámetros: queue, interface y paused son requeridos' });
  }
  // 'paused' debe ser 1 para pausar o 0 para reanudar.
  ami.action({
    action: 'QueuePause',
    queue: queue,
    interface: channel,
    paused: paused
  }, (err, response) => {
    if (err) {
      return res.status(500).json({ error: 'Error al pausar/reanudar la extensión', details: err });
    }
    const estado = paused == 1 ? 'pausada' : 'reanudad';
    return res.json({ message: `Extensión ${channel} ${estado} en la cola ${queue}`, response });
  });
});

// Iniciar el servidor
app.listen(port, () => {
  console.log(`API escuchando en http://localhost:${port}`);
});

