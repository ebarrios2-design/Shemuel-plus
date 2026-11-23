const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const src = path.resolve(__dirname, '../src');

test('cargar SSRE no carga config/postgres en require.cache', () => {
  const postgresPath = require.resolve('../src/config/postgres');
  const ssreAppPath = require.resolve('../src/apps/ssre.app');
  delete require.cache[postgresPath];
  delete require.cache[ssreAppPath];

  require(ssreAppPath);

  assert.equal(require.cache[postgresPath], undefined);
});

test('las rutas y el controlador SSRE no requieren config/postgres', () => {
  const ssreFiles = [
    path.join(src, 'routes', 'practicas-ssre.routes.js'),
    path.join(src, 'controllers', 'practicas-ssre.controller.js'),
  ];

  for (const file of ssreFiles) {
    const source = fs.readFileSync(file, 'utf8');
    assert.equal(source.includes('config/postgres'), false, `${path.basename(file)} no debe referenciar PostgreSQL`);
  }
});
