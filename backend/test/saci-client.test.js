const test = require('node:test');
const assert = require('node:assert/strict');
const saciClient = require('../src/services/saciClient');

test('SACI client autentica llamadas internas y conserva la respuesta', async () => {
  const originalFetch = global.fetch;
  const originalUrl = process.env.SACI_URL;
  const originalToken = process.env.SACI_INTERNAL_TOKEN;
  let llamada;
  process.env.SACI_URL = 'http://saci.test';
  process.env.SACI_INTERNAL_TOKEN = 'internal-token';
  global.fetch = async (url, options) => {
    llamada = { url, options };
    return new Response(JSON.stringify({ autorizado: true }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    });
  };

  try {
    const autorizado = await saciClient.validarAsignacion(
      'tenant-1',
      'estudiante-1',
      'estudiante',
      'asignacion-1'
    );
    assert.equal(autorizado, true);
    assert.equal(llamada.url, 'http://saci.test/internal/ssre/asignaciones/validar');
    assert.equal(llamada.options.headers['X-Internal-Service-Token'], 'internal-token');
    assert.deepEqual(JSON.parse(llamada.options.body), {
      tenantId: 'tenant-1',
      userId: 'estudiante-1',
      rol: 'estudiante',
      asignacionId: 'asignacion-1',
    });
  } finally {
    global.fetch = originalFetch;
    if (originalUrl === undefined) delete process.env.SACI_URL;
    else process.env.SACI_URL = originalUrl;
    if (originalToken === undefined) delete process.env.SACI_INTERNAL_TOKEN;
    else process.env.SACI_INTERNAL_TOKEN = originalToken;
  }
});

test('SACI client rechaza respuestas que no contienen JSON válido', async () => {
  const originalFetch = global.fetch;
  const originalUrl = process.env.SACI_URL;
  const originalToken = process.env.SACI_INTERNAL_TOKEN;
  process.env.SACI_URL = 'http://saci.test';
  process.env.SACI_INTERNAL_TOKEN = 'internal-token';
  global.fetch = async () => new Response('respuesta no JSON', { status: 200 });

  try {
    await assert.rejects(
      saciClient.listarAsignaciones('tenant-1', 'user-1', 'estudiante'),
      { status: 502, message: 'SACI devolvió una respuesta no válida.' }
    );
  } finally {
    global.fetch = originalFetch;
    if (originalUrl === undefined) delete process.env.SACI_URL;
    else process.env.SACI_URL = originalUrl;
    if (originalToken === undefined) delete process.env.SACI_INTERNAL_TOKEN;
    else process.env.SACI_INTERNAL_TOKEN = originalToken;
  }
});
