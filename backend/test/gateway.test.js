const test = require('node:test');
const assert = require('node:assert/strict');
const http = require('node:http');
const { crearGateway } = require('../src/apps/gateway.app');

async function listen(server) {
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  return `http://127.0.0.1:${server.address().port}`;
}

async function close(server) {
  await new Promise((resolve, reject) => {
    server.close((err) => (err ? reject(err) : resolve()));
  });
}

function sendRequest(url, options) {
  return new Promise((resolve, reject) => {
    const request = http.request(url, options, (response) => {
      let body = '';
      response.setEncoding('utf8');
      response.on('data', (chunk) => { body += chunk; });
      response.on('end', () => resolve({
        status: response.statusCode,
        body,
      }));
    });
    request.on('error', reject);
    request.end(options.body);
  });
}

test('gateway enruta solicitudes a SACI y transmite método, ruta y cuerpo', async () => {
  const saci = http.createServer((req, res) => {
    let body = '';
    req.setEncoding('utf8');
    req.on('data', (chunk) => { body += chunk; });
    req.on('end', () => {
      res.setHeader('content-type', 'application/json');
      res.end(JSON.stringify({ method: req.method, url: req.url, host: req.headers.host, body }));
    });
  });
  const ssre = http.createServer((_req, res) => res.end('ssre'));
  const saciUrl = await listen(saci);
  const ssreUrl = await listen(ssre);
  const gateway = http.createServer(crearGateway({ saciUrl, ssreUrl }));
  const gatewayUrl = await listen(gateway);

  try {
    const response = await sendRequest(`${gatewayUrl}/api/practicas/solicitudes?estado=pendiente`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Host: 'udi.shemuel.app',
      },
      body: JSON.stringify({ practica: 'observación' }),
    });
    const data = JSON.parse(response.body);

    assert.equal(response.status, 200);
    assert.equal(data.method, 'POST');
    assert.equal(data.url, '/api/practicas/solicitudes?estado=pendiente');
    assert.equal(data.host, 'udi.shemuel.app');
    assert.deepEqual(JSON.parse(data.body), { practica: 'observación' });
  } finally {
    await close(gateway);
    await close(saci);
    await close(ssre);
  }
});

test('gateway enruta talleres al servicio SSRE', async () => {
  const saci = http.createServer((_req, res) => res.end('saci'));
  const ssre = http.createServer((req, res) => res.end(req.url));
  const saciUrl = await listen(saci);
  const ssreUrl = await listen(ssre);
  const gateway = http.createServer(crearGateway({ saciUrl, ssreUrl }));
  const gatewayUrl = await listen(gateway);

  try {
    const response = await sendRequest(`${gatewayUrl}/api/practicas/talleres/taller-1/quiz/iniciar`, {
      method: 'GET',
      headers: {},
    });
    assert.equal(response.body, '/api/practicas/talleres/taller-1/quiz/iniciar');
  } finally {
    await close(gateway);
    await close(saci);
    await close(ssre);
  }
});
