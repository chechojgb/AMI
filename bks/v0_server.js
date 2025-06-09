const AsteriskManager = require('asterisk-manager');
const ami = new AsteriskManager(5038, '127.0.0.1', 'SoulPhone', 'ResItcHiNGEn**', true);

ami.on('connect', () => {
  console.log('Conectado al AMI');
  ami.action({ action: 'Command', command: 'core show channels' }, (err, res) => {
    if (err) {
      console.error('Error al ejecutar comando:', err);
    } else {
      console.log('Respuesta:', res);
    }
    ami.disconnect();
  });
});

ami.on('error', (err) => {
  console.error('Error en AMI:', err);
});
