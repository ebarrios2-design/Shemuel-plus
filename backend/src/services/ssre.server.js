require('dotenv').config();
const app = require('../apps/ssre.app');
const { connectMongo, mongoose } = require('../config/mongo');

async function start() {
  if (!process.env.SACI_INTERNAL_TOKEN) {
    throw new Error('Configura SACI_INTERNAL_TOKEN para conectar SSRE con SACI.');
  }

  connectMongo().catch((err) => {
    console.warn('[SSRE] MongoDB no está disponible; las rutas documentales responderán con HTTP 503:', err.message);
  });

  const port = Number(process.env.SSRE_PORT || 4002);
  const host = process.env.SSRE_HOST || '127.0.0.1';
  const server = app.listen(port, host, () => {
    console.log(`SSRE escuchando en http://${host}:${port}`);
  });

  const shutdown = async () => {
    server.close(async () => {
      await mongoose.disconnect();
      process.exit(0);
    });
  };
  process.once('SIGINT', shutdown);
  process.once('SIGTERM', shutdown);
}

start().catch((err) => {
  console.error('[SSRE] No se pudo iniciar:', err.message);
  process.exit(1);
});
