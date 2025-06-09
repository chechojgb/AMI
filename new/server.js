const express = require('express');
const { ami } = require('./amiConnection');
const queueRoutes = require('./routes/queueRoutes');
const channelRoutes = require('./routes/channelRoutes');
const extensionRoutes = require('./routes/extensionRoutes');

const app = express();
const port = 3000;

app.use(express.json());

app.use('/queue', queueRoutes);
app.use('/channel', channelRoutes);
app.use('/extension', extensionRoutes);

app.listen(port, () => {
  console.log(`API escuchando en http://localhost:${port}`);
});




