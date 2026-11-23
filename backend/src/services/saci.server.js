require('dotenv').config();
const app = require('../apps/saci.app');
const { pool } = require('../config/postgres');

async function start() {
  if (!process.env.SACI_INTERNAL_TOKEN) {
    throw new Error('Configura SACI_INTERNAL_TOKEN para habilitar las llamadas internas de SSRE.');
  }

  await pool.query('SELECT 1');
  console.log('[SACI] Conexión PostgreSQL verificada.');

  const port = Number(process.env.SACI_PORT || 4001);
  const host = process.env.SACI_HOST || '127.0.0.1';
  const server = app.listen(port, host, () => {
    console.log(`SACI escuchando en http://${host}:${port}`);
  });

  const shutdown = async () => {
    server.close(async () => {
      await pool.end();
      process.exit(0);
    });
  };
  process.once('SIGINT', shutdown);
  process.once('SIGTERM', shutdown);
}

start().catch((err) => {
  console.error('[SACI] No se pudo iniciar:', err.message);
  process.exit(1);
});
