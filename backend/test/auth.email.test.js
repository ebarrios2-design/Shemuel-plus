const test = require('node:test');
const assert = require('node:assert/strict');
const postgres = require('../src/config/postgres');
const { verificarCorreo } = require('../src/controllers/auth.controller');

async function withMockedQuery(mockQuery, testFn) {
  const originalQuery = postgres.query;
  postgres.query = mockQuery;

  try {
    await testFn();
  } finally {
    postgres.query = originalQuery;
  }
}

test('verifica el correo normalizado dentro de la institución actual', async () => {
  await withMockedQuery(async (sql, params) => {
    assert.match(sql, /institucion_id = \$1 AND email = \$2 AND activo = TRUE/);
    assert.deepEqual(params, ['tenant-1', 'ana@demo.com']);
    return { rows: [{ '?column?': 1 }] };
  }, async () => {
    const req = { tenant: { id: 'tenant-1' }, body: { email: '  Ana@Demo.com ' } };
    const res = {
      json: (payload) => assert.deepEqual(payload, { email: 'ana@demo.com' }),
    };

    await verificarCorreo(req, res, (err) => { throw err; });
  });
});

test('rechaza un correo que no pertenece a una cuenta activa', async () => {
  await withMockedQuery(async () => ({ rows: [] }), async () => {
    const req = { tenant: { id: 'tenant-1' }, body: { email: 'missing@demo.com' } };
    let statusCode;
    let response;
    const res = {
      status: (code) => {
        statusCode = code;
        return res;
      },
      json: (payload) => { response = payload; },
    };

    await verificarCorreo(req, res, (err) => { throw err; });

    assert.equal(statusCode, 404);
    assert.match(response.error, /No encontramos una cuenta activa/);
  });
});

test('rechaza direcciones de correo con formato inválido', async () => {
  await withMockedQuery(async () => {
    assert.fail('No debe consultar la base de datos para un correo inválido');
  }, async () => {
    const req = { tenant: { id: 'tenant-1' }, body: { email: 'no-es-un-correo' } };
    let statusCode;
    const res = {
      status: (code) => {
        statusCode = code;
        return res;
      },
      json: () => {},
    };

    await verificarCorreo(req, res, (err) => { throw err; });

    assert.equal(statusCode, 400);
  });
});
