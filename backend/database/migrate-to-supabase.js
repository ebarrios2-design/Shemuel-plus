require('dotenv').config();
const fs = require('fs');
const path = require('path');
const { Pool } = require('pg');
const { getPostgresSslConfig } = require('../src/config/postgresSsl');

const tables = [
  'instituciones',
  'usuarios',
  'instituciones_receptoras',
  'asignaciones_practica',
  'evaluaciones',
];

const sourcePool = new Pool({
  host: process.env.PG_HOST,
  port: process.env.PG_PORT,
  database: process.env.PG_DATABASE,
  user: process.env.PG_USER,
  password: process.env.PG_PASSWORD,
});

function quoteIdentifier(identifier) {
  return `"${identifier.replace(/"/g, '""')}"`;
}

async function ensureTargetSchema(client) {
  const result = await client.query(
    `SELECT table_name
       FROM information_schema.tables
      WHERE table_schema = 'public'
        AND table_name = ANY($1::text[])`,
    [tables]
  );
  const existing = new Set(result.rows.map((row) => row.table_name));

  if (existing.size === 0) {
    const schema = fs.readFileSync(path.join(__dirname, 'schema.sql'), 'utf8');
    await client.query(schema);
    console.log('[supabase] Esquema creado.');
    return;
  }

  const missing = tables.filter((table) => !existing.has(table));
  if (missing.length > 0) {
    throw new Error(
      `El esquema de Supabase está incompleto. Faltan tablas: ${missing.join(', ')}.`
    );
  }
}

async function copyTable(sourceClient, targetClient, table) {
  const sourceResult = await sourceClient.query(`SELECT * FROM public.${table}`);
  const columns = sourceResult.fields.map((field) => field.name);

  if (sourceResult.rows.length === 0) {
    console.log(`[migración] ${table}: sin filas.`);
    return;
  }

  const columnList = columns.map(quoteIdentifier).join(', ');
  const placeholders = columns.map((_, index) => `$${index + 1}`).join(', ');
  const insertQuery =
    `INSERT INTO public.${quoteIdentifier(table)} (${columnList}) ` +
    `VALUES (${placeholders}) ON CONFLICT DO NOTHING`;
  let inserted = 0;

  for (const row of sourceResult.rows) {
    const values = columns.map((column) => row[column]);
    const result = await targetClient.query(insertQuery, values);
    inserted += result.rowCount;
  }

  console.log(
    `[migración] ${table}: ${inserted} copiadas, ` +
      `${sourceResult.rows.length - inserted} existentes omitidas.`
  );
}

function getTargetDatabaseUrl() {
  const candidates = [
    ['SUPABASE_DATABASE_URL', process.env.SUPABASE_DATABASE_URL],
    ['PG_CONNECTION_STRING', process.env.PG_CONNECTION_STRING],
  ];

  for (const [name, value] of candidates) {
    if (!value) continue;

    try {
      const url = new URL(value);
      if (url.hostname && url.hostname !== 'host' && url.password) {
        return { name, value };
      }
    } catch (_error) {
      // Try the next configured database URL.
    }
  }

  throw new Error(
    'Configura SUPABASE_DATABASE_URL o PG_CONNECTION_STRING con una URI real de Supabase.'
  );
}

async function migrate() {
  const targetDatabase = getTargetDatabaseUrl();

  let sourceClient;
  let targetPool;
  let targetClient;
  let sourceTransaction = false;
  let targetTransaction = false;

  try {
    if (process.env.PG_SSL !== 'true') {
      throw new Error('La conexión a Supabase requiere PG_SSL=true.');
    }

    targetPool = new Pool({
      connectionString: targetDatabase.value,
      ssl: getPostgresSslConfig(),
      max: 1,
    });

    sourceClient = await sourcePool.connect();
    targetClient = await targetPool.connect();
    await sourceClient.query('BEGIN TRANSACTION ISOLATION LEVEL REPEATABLE READ READ ONLY');
    sourceTransaction = true;
    await targetClient.query('BEGIN');
    targetTransaction = true;

    await ensureTargetSchema(targetClient);
    for (const table of tables) {
      await copyTable(sourceClient, targetClient, table);
    }

    await targetClient.query('COMMIT');
    targetTransaction = false;
    await sourceClient.query('COMMIT');
    sourceTransaction = false;
    console.log('[migración] Migración completada.');
  } catch (error) {
    if (targetTransaction) {
      await targetClient.query('ROLLBACK');
    }
    if (sourceTransaction) {
      await sourceClient.query('ROLLBACK');
    }
    throw error;
  } finally {
    if (sourceClient) sourceClient.release();
    if (targetClient) targetClient.release();
    await sourcePool.end();
    if (targetPool) await targetPool.end();
  }
}

migrate().catch((error) => {
  console.error('[migración] No se pudo completar:', error.message);
  process.exitCode = 1;
});
