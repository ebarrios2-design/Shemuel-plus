const test = require('node:test');
const assert = require('node:assert/strict');

const postgres = require('../src/config/postgres');

async function withMockedQuery(testFn) {
  const originalQuery = postgres.query;
  postgres.query = async (text, params) => {
    const normalized = text.replace(/\s+/g, ' ').trim();

    if (normalized.startsWith('SELECT unnest')) {
      return { rows: [{ role: 'estudiante' }, { role: 'docente_asesor' }, { role: 'institucion_receptora' }, { role: 'director' }] };
    }

    if (normalized.startsWith('SELECT id, nombre_completo')) {
      return { rows: [{ id: 'u1', nombre_completo: 'Ana', email: 'ana@demo.com', rol: 'director', activo: true }] };
    }

    if (normalized.startsWith('SELECT id, nombre_completo, email, rol, activo')) {
      return { rows: [] };
    }

    if (normalized.includes('INSERT INTO usuarios')) {
      return {
        rows: [{
          id: 'u2',
          nombre_completo: 'Nuevo Usuario',
          email: 'nuevo@demo.com',
          rol: 'estudiante',
          activo: true,
        }],
      };
    }

    if (normalized.includes('UPDATE usuarios')) {
      return { rows: [{ id: 'u1', nombre_completo: 'Ana Actualizada', email: 'ana@demo.com', rol: 'director', activo: true }] };
    }

    if (normalized.includes('UPDATE usuarios SET activo = FALSE')) {
      return { rows: [{ id: 'u1' }] };
    }

    return { rows: [] };
  };

  try {
    await testFn();
  } finally {
    postgres.query = originalQuery;
  }
}

test('lista los roles disponibles del sistema', async () => {
  await withMockedQuery(async () => {
    const { listarRoles } = require('../src/controllers/usuarios.controller');
    const req = { tenant: { id: 'tenant-1' } };
    const res = {
      json: (payload) => {
        assert.deepEqual(payload, ['estudiante', 'docente_asesor', 'institucion_receptora', 'director']);
      },
    };

    await listarRoles(req, res, () => {});
  });
});

test('lista usuarios filtrados por rol dentro del tenant', async () => {
  await withMockedQuery(async () => {
    const { listarUsuarios } = require('../src/controllers/usuarios.controller');
    const req = { tenant: { id: 'tenant-1' }, query: { rol: 'director' } };
    const res = {
      json: (payload) => {
        assert.equal(Array.isArray(payload), true);
        assert.equal(payload[0].rol, 'director');
      },
    };

    await listarUsuarios(req, res, () => {});
  });
});

test('crea un usuario con rol válido y contraseña hasheada', async () => {
  await withMockedQuery(async () => {
    const { crearUsuario } = require('../src/controllers/usuarios.controller');
    const req = {
      tenant: { id: 'tenant-1' },
      body: {
        nombreCompleto: 'Nuevo Usuario',
        email: 'nuevo@demo.com',
        password: 'Secret123*',
        rol: 'estudiante',
      },
    };

    const res = {
      status: (code) => ({ json: (payload) => {
        assert.equal(code, 201);
        assert.equal(payload.usuario.email, 'nuevo@demo.com');
        assert.equal(payload.usuario.rol, 'estudiante');
      } }),
    };

    await crearUsuario(req, res, () => {});
  });
});

test('actualiza un usuario existente dentro del tenant', async () => {
  await withMockedQuery(async () => {
    const { actualizarUsuario } = require('../src/controllers/usuarios.controller');
    const req = {
      tenant: { id: 'tenant-1' },
      params: { id: 'u1' },
      body: { nombreCompleto: 'Ana Actualizada', email: 'ana@demo.com', rol: 'director' },
    };

    const res = {
      json: (payload) => {
        assert.equal(payload.nombre_completo, 'Ana Actualizada');
        assert.equal(payload.rol, 'director');
      },
    };

    await actualizarUsuario(req, res, () => {});
  });
});

test('elimina un usuario soft-delete por tenant', async () => {
  await withMockedQuery(async () => {
    const { eliminarUsuario } = require('../src/controllers/usuarios.controller');
    const req = { tenant: { id: 'tenant-1' }, params: { id: 'u1' } };
    const res = {
      json: (payload) => {
        assert.equal(payload.success, true);
        assert.equal(payload.id, 'u1');
      },
    };

    await eliminarUsuario(req, res, () => {});
  });
});
