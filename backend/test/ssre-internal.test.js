const test = require('node:test');
const assert = require('node:assert/strict');
const postgres = require('../src/config/postgres');
const controller = require('../src/controllers/ssre-internal.controller');

async function acreditarConRespuestas(insertRows, existingRow = { asignacion_id: 'asignacion-1', horas: 3 }) {
  const statements = [];
  const actualizado = {
    id: 'asignacion-1',
    horas_cumplidas: 4,
    horas_requeridas: 10,
    estado: 'en_curso',
  };
  const client = {
    async query(sql) {
      statements.push(sql.trim().split(/\s+/).slice(0, 3).join(' '));
      if (sql.includes('FOR UPDATE')) {
        return { rows: [{ id: 'asignacion-1', horas_cumplidas: 1, horas_requeridas: 10, estado: 'en_curso' }] };
      }
      if (sql.includes('INSERT INTO acreditaciones_horas')) return { rows: insertRows };
      if (sql.includes('SELECT asignacion_id, horas')) {
        return { rows: [existingRow] };
      }
      if (sql.includes('SELECT id, horas_cumplidas, horas_requeridas, estado')) {
        return { rows: [actualizado] };
      }
      return { rows: [] };
    },
    release() {},
  };
  const originalConnect = postgres.pool.connect;
  postgres.pool.connect = async () => client;

  const response = {
    statusCode: 200,
    status(code) {
      this.statusCode = code;
      return this;
    },
    json(body) {
      this.body = body;
      return this;
    },
  };
  let nextError;

  try {
    await controller.acreditarHoras({
      body: { tenantId: 'tenant-1', horas: 3, claveIdempotencia: 'quiz:delivery-1' },
      params: { id: 'asignacion-1' },
    }, response, (err) => { nextError = err; });
  } finally {
    postgres.pool.connect = originalConnect;
  }

  if (nextError) throw nextError;
  return { response, statements };
}

test('SACI registra una acreditación de horas una sola vez', async () => {
  const { response, statements } = await acreditarConRespuestas([{ id: 1 }]);

  assert.equal(response.statusCode, 200);
  assert.equal(response.body.acreditada, true);
  assert.equal(statements.filter((statement) => statement === 'UPDATE asignaciones_practica SET').length, 1);
  assert.equal(statements.at(-1), 'COMMIT');
});

test('SACI reconoce una clave ya acreditada sin volver a sumar horas', async () => {
  const { response, statements } = await acreditarConRespuestas([]);

  assert.equal(response.statusCode, 200);
  assert.equal(response.body.acreditada, false);
  assert.equal(statements.some((statement) => statement === 'UPDATE asignaciones_practica SET'), false);
  assert.equal(statements.at(-1), 'COMMIT');
});

test('SACI rechaza reutilizar una clave idempotente para otra asignación', async () => {
  const { response, statements } = await acreditarConRespuestas([], {
    asignacion_id: 'otra-asignacion',
    horas: 3,
  });

  assert.equal(response.statusCode, 409);
  assert.match(response.body.error, /ya fue usada/);
  assert.equal(statements.at(-1), 'ROLLBACK');
  assert.equal(statements.some((statement) => statement === 'UPDATE asignaciones_practica SET'), false);
});

test('SACI valida que un docente sea dueño de una asignación sin exigir estudianteId', async () => {
  const originalQuery = postgres.query;
  let sqlEjecutado;
  let parametros;
  postgres.query = async (sql, params) => {
    sqlEjecutado = sql;
    parametros = params;
    return { rows: [{ id: 'asignacion-1' }] };
  };

  const response = {
    statusCode: 200,
    status(code) {
      this.statusCode = code;
      return this;
    },
    json(body) {
      this.body = body;
      return this;
    },
  };

  try {
    await controller.validarAsignacion({
      body: {
        tenantId: 'tenant-1',
        userId: 'docente-1',
        rol: 'docente_asesor',
        asignacionId: 'asignacion-1',
        estudianteId: null,
      },
    }, response, (err) => { throw err; });
  } finally {
    postgres.query = originalQuery;
  }

  assert.equal(response.body.autorizado, true);
  assert.match(sqlEjecutado, /docente_id = \$3/);
  assert.doesNotMatch(sqlEjecutado, /estudiante_id/);
  assert.deepEqual(parametros, ['tenant-1', 'asignacion-1', 'docente-1']);
});
