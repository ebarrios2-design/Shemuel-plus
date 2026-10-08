const { Pool } = require('pg');

// Pool de conexiones a PostgreSQL: aqui viven los datos estructurados
// y transaccionales (instituciones, usuarios, asignaciones, evaluaciones).
const pool = new Pool({
  host: process.env.PG_HOST,
  port: process.env.PG_PORT,
  database: process.env.PG_DATABASE,
  user: process.env.PG_USER,
  password: process.env.PG_PASSWORD,
  max: 10,
  idleTimeoutMillis: 30000,
});

pool.on('error', (err) => {
  console.error('[postgres] Error inesperado en el pool:', err.message);
});

async function query(text, params) {
  const start = Date.now();
  const result = await pool.query(text, params);
  if (process.env.NODE_ENV !== 'production') {
    console.log('[postgres]', text.split('\n')[0].trim(), `(${Date.now() - start}ms)`);
  }
  return result;
}

module.exports = { pool, query };
