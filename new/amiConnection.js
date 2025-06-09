const AsteriskManager = require('asterisk-manager');

const ami = new AsteriskManager(5038, '10.57.251.181', 'SoulPhone', 'ResItcHiNGEn**', true);
ami.keepConnected();

ami.on('connect', () => {
  console.log('Conectado al AMI');
});

ami.on('error', (err) => {
  console.error('Error en AMI:', err);
});

module.exports = { ami };
