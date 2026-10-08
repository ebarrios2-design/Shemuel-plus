require('dotenv').config();
const app = require('./app');
const { pool } = require('./config/postgres');
const { connectMongo } = require('./config/mongo');

const PORT = process.env.PORT || 6000;

async function start() {
  try {
    // Verifica PostgreSQL
    await pool.query('SELECT 1');
    console.log('[postgres] Conexion verificada.');

    // Conecta MongoDB
    await connectMongo();

    app.listen(PORT, () => {
      console.log(`Shemuel Plus backend escuchando en http://localhost:${PORT}`);
      console.log(`Prueba local: http://udi.localhost:${PORT}/api/public/institucion`);
    });
  } catch (err) {
    console.error('No se pudo iniciar el servidor:', err.message);
    process.exit(1);
  }
}

start();
