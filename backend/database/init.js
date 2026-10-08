/**
 * Inicializa la base de datos PostgreSQL para desarrollo local:
 * 1. Ejecuta schema.sql (crea tablas, tipos, indices)
 * 2. Ejecuta seed.sql (crea las dos instituciones de ejemplo)
 * 3. Crea usuarios de prueba con password_hash real (bcrypt)
 *
 * Uso: npm run db:init
 */
require('dotenv').config();
const fs = require('fs');
const path = require('path');
const bcrypt = require('bcryptjs');
const { Pool } = require('pg');

const pool = new Pool({
  host: process.env.PG_HOST,
  port: process.env.PG_PORT,
  database: process.env.PG_DATABASE,
  user: process.env.PG_USER,
  password: process.env.PG_PASSWORD,
});

const UDI_ID = '11111111-1111-1111-1111-111111111111';
const UAN_ID = '22222222-2222-2222-2222-222222222222';

async function run() {
  const client = await pool.connect();
  try {
    console.log('-> Ejecutando schema.sql ...');
    const schema = fs.readFileSync(path.join(__dirname, 'schema.sql'), 'utf8');
    await client.query(schema);

    console.log('-> Ejecutando seed.sql (instituciones) ...');
    const seed = fs.readFileSync(path.join(__dirname, 'seed.sql'), 'utf8');
    await client.query(seed);

    console.log('-> Creando usuarios de prueba ...');
    const passwordHash = await bcrypt.hash('Practica2026*', 10);

    const usuariosDemo = [
      [UDI_ID, 'Ana Torres', 'ana.torres@udi.demo', 'director'],
      [UDI_ID, 'Carlos Ruiz', 'carlos.ruiz@udi.demo', 'docente_asesor'],
      [UDI_ID, 'Estebankito Diaz', 'estudiante@udi.demo', 'estudiante'],
      [UAN_ID, 'Marta Leon', 'marta.leon@uan.demo', 'director'],
    ];

    for (const [institucionId, nombre, email, rol] of usuariosDemo) {
      await client.query(
        `INSERT INTO usuarios (institucion_id, nombre_completo, email, password_hash, rol)
         VALUES ($1, $2, $3, $4, $5)
         ON CONFLICT (institucion_id, email) DO NOTHING`,
        [institucionId, nombre, email, passwordHash, rol]
      );
    }

    console.log('Listo. Instituciones de prueba: udi.localhost / uan.localhost');
    console.log('Password de todos los usuarios demo: Practica2026*');
  } finally {
    client.release();
    await pool.end();
  }
}

run().catch((err) => {
  console.error('Error inicializando la base de datos:', err);
  process.exit(1);
});
