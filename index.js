const express = require('express');
const cors = require('cors');
const app = express();
const port = process.env.PORT || 3013;

// Rutas que tengas
const queueRoutes = require('./routes/queueRoutes');
const extensionRoutes = require('./routes/extensionRoutes');
const channelRoutes = require('./routes/channelRoutes');

app.use(cors());
app.use(express.json());

app.use('/queue', queueRoutes);
app.use('/extension', extensionRoutes);
app.use('/channel', channelRoutes);

app.get('/', (req, res) => {
  res.send('API AMI funcionando 🔥');
});

app.listen(port, () => {
  console.log(`Servidor corriendo en el puerto ${port}`);
});
