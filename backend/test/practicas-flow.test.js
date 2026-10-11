const test = require('node:test');
const assert = require('node:assert/strict');
const practicas = require('../src/controllers/practicas.controller');
const postgres = require('../src/config/postgres');

async function withMockedQuery(testFn) {
  const originalQuery = postgres.query;
  postgres.query = async (text, params) => {
    const normalized = text.replace(/\s+/g, ' ').trim();

    if (normalized.includes('FROM instituciones_receptoras')) {
      return { rows: [{ id: 'i1', nombre: 'Colegio Demo', direccion: 'Cra 1', contacto_nombre: 'Ana' }] };
    }

    if (normalized.includes('INSERT INTO instituciones_receptoras')) {
      return { rows: [{ id: 'i2', nombre: 'Colegio Nuevo', direccion: 'Cra 2', contacto_nombre: 'Luis' }] };
    }

    if (normalized.includes('FROM usuarios') && normalized.includes('WHERE institucion_id = $1 AND rol = $2')) {
      return { rows: [{ id: 'u1', nombre_completo: 'Estudiante Uno', rol: 'estudiante' }, { id: 'u2', nombre_completo: 'Estudiante Dos', rol: 'estudiante' }] };
    }

    if (normalized.includes('INSERT INTO asignaciones_practica')) {
      return { rows: [{ id: 'a1', estudiante_id: 'u1', docente_id: 'd1', institucion_receptora_id: 'i1', estado: 'pendiente' }] };
    }

    return { rows: [] };
  };

  try {
    await testFn();
  } finally {
    postgres.query = originalQuery;
  }
}

test('lista instituciones receptoras del tenant', async () => {
  await withMockedQuery(async () => {
    const req = { tenant: { id: 'tenant-1' } };
    const res = { json: (payload) => {
      assert.equal(Array.isArray(payload), true);
      assert.equal(payload[0].nombre, 'Colegio Demo');
    } };

    await practicas.listarInstitucionesReceptoras(req, res, () => {});
  });
});

test('crea una institución receptora con el tenant actual', async () => {
  await withMockedQuery(async () => {
    const req = { tenant: { id: 'tenant-1' }, body: { nombre: 'Colegio Nuevo', direccion: 'Cra 2', contactoNombre: 'Luis' } };
    const res = { status: (code) => ({ json: (payload) => {
      assert.equal(code, 201);
      assert.equal(payload.nombre, 'Colegio Nuevo');
    } }) };

    await practicas.crearInstitucionReceptora(req, res, () => {});
  });
});

test('lista usuarios por rol en el tenant', async () => {
  await withMockedQuery(async () => {
    const req = { tenant: { id: 'tenant-1' }, params: { rol: 'estudiante' } };
    const res = { json: (payload) => {
      assert.equal(Array.isArray(payload), true);
      assert.equal(payload.length, 2);
      assert.equal(payload[0].rol, 'estudiante');
    } };

    await practicas.listarUsuariosPorRol(req, res, () => {});
  });
});

test('actualiza horas cumplidas de una asignación', async () => {
  const originalQuery = postgres.query;
  postgres.query = async (text) => {
    if (String(text).includes('UPDATE asignaciones_practica')) {
      return { rows: [{ id: 'a1', horas_cumplidas: 80, horas_requeridas: 120, estado: 'en_curso' }] };
    }
    return { rows: [] };
  };

  try {
    const req = { tenant: { id: 'tenant-1' }, params: { id: 'a1' }, body: { horasCumplidas: 80 } };
    const res = { json: (payload) => {
      assert.equal(payload.horas_cumplidas, 80);
      assert.equal(payload.estado, 'en_curso');
    } };

    await practicas.actualizarHorasAsignacion(req, res, () => {});
  } finally {
    postgres.query = originalQuery;
  }
});

test('registra una evaluación académica para la asignación', async () => {
  const originalQuery = postgres.query;
  postgres.query = async (text) => {
    if (String(text).includes('INSERT INTO evaluaciones')) {
      return { rows: [{ id: 'e1', asignacion_id: 'a1', calificacion: 4.5 }] };
    }
    return { rows: [] };
  };

  try {
    const req = { tenant: { id: 'tenant-1' }, user: { sub: 'd1' }, body: { asignacionId: 'a1', calificacion: 4.5 } };
    const res = { status: (code) => ({ json: (payload) => {
      assert.equal(code, 201);
      assert.equal(payload.calificacion, 4.5);
    } }) };

    await practicas.crearEvaluacion(req, res, () => {});
  } finally {
    postgres.query = originalQuery;
  }
});
