/**
 * Punto de entrada del backend de Shemuel Plus.
 *
 * Su responsabilidad es iniciar la aplicacion despues de verificar PostgreSQL.
 * MongoDB es opcional para que las rutas relacionales sigan disponibles. Acopla:
 * - app.js (servidor Express)
 * - PostgreSQL (datos relacionales, requerido)
 * - MongoDB (datos documentales, opcional)
 */
require('dotenv').config();
const app = require('./app');
const { pool } = require('./config/postgres');
const { connectMongo } = require('./config/mongo');

const PORT = process.env.PORT || 6000;

async function start() {
  try {
    // Verifica PostgreSQL antes de levantar la API.
    await pool.query('SELECT 1');
    console.log('[postgres] Conexion verificada.');

    app.listen(PORT, () => {
      console.log(`Shemuel Plus backend escuchando en http://localhost:${PORT}`);
      console.log(`Prueba local: http://udi.localhost:${PORT}/api/public/institucion`);
    });

    // MongoDB solo es requerido por las rutas de documentos.
    connectMongo().catch((err) => {
      console.warn('[mongo] No disponible; la API seguirá funcionando sin las rutas documentales:', err.message);
    });
  } catch (err) {
    console.error('No se pudo iniciar el servidor:', err.message);
    process.exit(1);
  }
}

start();
