const test = require('node:test');
const assert = require('node:assert/strict');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const postgres = require('../src/config/postgres');
const { login, cambiarPassword } = require('../src/controllers/auth.controller');
const { requireAuth, requireRole } = require('../src/middleware/auth');

const JWT_SECRET = 'password-change-test-secret';

async function withMockedQuery(mockQuery, testFn) {
  const originalQuery = postgres.query;
  const originalSecret = process.env.JWT_SECRET;
  postgres.query = mockQuery;
  process.env.JWT_SECRET = JWT_SECRET;

  try {
    await testFn();
  } finally {
    postgres.query = originalQuery;
    if (originalSecret === undefined) {
      delete process.env.JWT_SECRET;
    } else {
      process.env.JWT_SECRET = originalSecret;
    }
  }
}

function createResponse() {
  return {
    statusCode: 200,
    status(code) {
      this.statusCode = code;
      return this;
    },
    json(payload) {
      this.payload = payload;
      return this;
    },
  };
}

test('login marca la cuenta con cambio obligatorio en la respuesta y el JWT', async () => {
  const passwordHash = await bcrypt.hash('admin', 4);
  await withMockedQuery(async (sql, params) => {
    assert.match(sql, /requiere_cambio_password/);
    assert.deepEqual(params, ['tenant-1', 'admin@udi.edu.co']);
    return {
      rows: [{
        id: 'user-1',
        nombre_completo: 'Administración UDI',
        email: 'admin@udi.edu.co',
        password_hash: passwordHash,
        rol: 'institucion_receptora',
        requiere_cambio_password: true,
      }],
    };
  }, async () => {
    const req = {
      tenant: { id: 'tenant-1' },
      body: { email: 'ADMIN@UDI.EDU.CO', password: 'admin' },
    };
    const res = createResponse();

    await login(req, res, (err) => { throw err; });

    assert.equal(res.payload.requiereCambioPassword, true);
    assert.equal(res.payload.usuario.rol, 'institucion_receptora');
    assert.equal(jwt.verify(res.payload.token, JWT_SECRET).requiereCambioPassword, true);
    assert.equal(Object.prototype.hasOwnProperty.call(res.payload.usuario, 'password_hash'), false);
  });
});

test('cambiar contraseña actualiza el hash, quita el bloqueo y emite un JWT nuevo', async () => {
  const passwordHash = await bcrypt.hash('admin', 4);
  let updateParams;

  await withMockedQuery(async (sql, params) => {
    if (sql.includes('SELECT id, nombre_completo')) {
      assert.match(sql, /institucion_id = \$1 AND id = \$2 AND activo = TRUE/);
      assert.deepEqual(params, ['tenant-1', 'user-1']);
      return {
        rows: [{
          id: 'user-1',
          nombre_completo: 'Administración UDI',
          email: 'admin@udi.edu.co',
          password_hash: passwordHash,
          rol: 'institucion_receptora',
        }],
      };
    }

    assert.match(sql, /requiere_cambio_password = FALSE/);
    assert.match(sql, /institucion_id = \$1 AND id = \$2 AND activo = TRUE/);
    updateParams = params;
    return {
      rows: [{
        id: 'user-1',
        nombre_completo: 'Administración UDI',
        email: 'admin@udi.edu.co',
        rol: 'institucion_receptora',
      }],
    };
  }, async () => {
    const req = {
      tenant: { id: 'tenant-1' },
      user: { sub: 'user-1' },
      body: { passwordActual: 'admin', passwordNueva: 'NuevaClaveSegura2026' },
    };
    const res = createResponse();

    await cambiarPassword(req, res, (err) => { throw err; });

    assert.equal(res.statusCode, 200);
    assert.equal(await bcrypt.compare('NuevaClaveSegura2026', updateParams[2]), true);
    assert.equal(res.payload.requiereCambioPassword, false);
    assert.equal(jwt.verify(res.payload.token, JWT_SECRET).requiereCambioPassword, false);
  });
});

test('requireAuth bloquea otras rutas hasta cambiar la contraseña', () => {
  const originalSecret = process.env.JWT_SECRET;
  process.env.JWT_SECRET = JWT_SECRET;
  try {
    const token = jwt.sign(
      { sub: 'user-1', institucionId: 'tenant-1', rol: 'institucion_receptora', requiereCambioPassword: true },
      JWT_SECRET
    );
    const req = {
      headers: { authorization: `Bearer ${token}` },
      originalUrl: '/api/usuarios',
      tenant: { id: 'tenant-1' },
    };
    const res = createResponse();
    let continued = false;

    requireAuth(req, res, () => { continued = true; });

    assert.equal(continued, false);
    assert.equal(res.statusCode, 403);
    assert.equal(res.payload.code, 'PASSWORD_CHANGE_REQUIRED');

    const changeRequest = { ...req, originalUrl: '/api/auth/cambiar-password' };
    let changeAllowed = false;
    requireAuth(changeRequest, createResponse(), () => { changeAllowed = true; });
    assert.equal(changeAllowed, true);
  } finally {
    if (originalSecret === undefined) {
      delete process.env.JWT_SECRET;
    } else {
      process.env.JWT_SECRET = originalSecret;
    }
  }
});

test('el rol institucion_receptora puede usar las rutas de gestión de usuarios', () => {
  const requireUserManager = requireRole('director', 'institucion_receptora');
  let continued = false;

  requireUserManager({ user: { rol: 'institucion_receptora' } }, createResponse(), () => { continued = true; });

  assert.equal(continued, true);
});
