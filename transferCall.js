const express = require('express');
const AsteriskManager = require('asterisk-manager');

const app = express();
const port = 3006;

const ami = new AsteriskManager(5038, '10.57.251.179', 'SoulPhone', 'ResItcHiNGEn**', true);
ami.keepConnected();

ami.on('connect', () => console.log('Conectado al AMI'));
ami.on('error', err => console.error('Error AMI:', err));

app.use(express.json());

const destinos = {
  Retencion: '690009010119',
  Soporte: '960209010114',
  Tramites: '960209010124',
  Movil: '960209030008',
  Pruebas: '960209030020'
};

app.post('/transferir', (req, res) => {
  const { canal, destino } = req.body;

  if (!canal || !destino) {
    return res.status(400).json({ error: 'Faltan parámetros: canal o destino' });
  }

  const operacion = destinos[destino];

  if (!operacion) {
    return res.status(400).json({ error: 'Destino no válido' });
  }

  const comando = `channel redirect ${canal} default,${operacion},1`;

  ami.action({ action: 'Command', command: comando }, (err, response) => {
    if (err) {
      console.error('Error al transferir llamada:', err);
      return res.status(500).json({ error: 'Error al transferir llamada', details: err });
    }

    const output = response.output || response.message || 'Transferencia ejecutada';
    console.log(`Transferencia ejecutada: ${comando}`);
    res.json({ resultado: 'Transferencia ejecutada', comando, respuesta: output });
  });
});

app.listen(port, () => {
  console.log(`API de transferencia escuchando en http://localhost:${port}`);
});

