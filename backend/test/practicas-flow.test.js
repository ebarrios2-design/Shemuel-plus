const test = require('node:test');
const assert = require('node:assert/strict');
const practicasSaci = require('../src/controllers/practicas-saci.controller');
const practicasSsre = require('../src/controllers/practicas-ssre.controller');
const postgres = require('../src/config/postgres');
const Observacion = require('../src/models/mongo/Observacion');
const saciClient = require('../src/services/saciClient');

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

    await practicasSaci.listarInstitucionesReceptoras(req, res, () => {});
  });
});

test('crea una institución receptora con el tenant actual', async () => {
  await withMockedQuery(async () => {
    const req = { tenant: { id: 'tenant-1' }, body: { nombre: 'Colegio Nuevo', direccion: 'Cra 2', contactoNombre: 'Luis' } };
    const res = { status: (code) => ({ json: (payload) => {
      assert.equal(code, 201);
      assert.equal(payload.nombre, 'Colegio Nuevo');
    } }) };

    await practicasSaci.crearInstitucionReceptora(req, res, () => {});
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

    await practicasSaci.listarUsuariosPorRol(req, res, () => {});
  });
});

test('actualiza horas cumplidas de una asignación', async () => {
  const originalQuery = postgres.query;
  postgres.query = async (text) => {
    if (String(text).includes('UPDATE asignaciones_practica')) {
      assert.match(text, /'finalizada'::estado_asignacion/);
      assert.match(text, /'en_curso'::estado_asignacion/);
      assert.match(text, /'pendiente'::estado_asignacion/);
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

    await practicasSaci.actualizarHorasAsignacion(req, res, () => {});
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

    await practicasSaci.crearEvaluacion(req, res, () => {});
  } finally {
    postgres.query = originalQuery;
  }
});

test('crea una asignación sin institución receptora y usa el tenant actual', async () => {
  const originalQuery = postgres.query;
  let capturedParams;
  postgres.query = async (_text, params) => {
    if (String(_text).includes('FROM usuarios d')) {
      return { rows: [{ id: 'd1', estudiantes_activos: 3 }] };
    }
    capturedParams = params;
    return { rows: [{ id: 'a1', institucion_id: 'tenant-1', institucion_receptora_id: null }] };
  };

  try {
    const req = {
      tenant: { id: 'tenant-1' },
      body: {
        estudianteId: 'u1',
        docenteId: 'd1',
        fechaInicio: '2026-10-01',
        fechaFin: null,
        horasRequeridas: 120,
      },
    };
    const res = { status: (code) => ({ json: (payload) => {
      assert.equal(code, 201);
      assert.equal(payload.institucion_id, 'tenant-1');
    } }) };

    await practicasSaci.crearAsignacion(req, res, () => {});
    assert.deepEqual(capturedParams, ['tenant-1', 'u1', 'd1', null, '2026-10-01', null, 120]);
  } finally {
    postgres.query = originalQuery;
  }
});

test('guarda el seguimiento vinculado al tenant, asignación y docente', async () => {
  const originalQuery = postgres.query;
  const originalCreate = Observacion.create;
  const validarAsignacionOriginal = saciClient.validarAsignacion;
  let savedObservation;
  saciClient.validarAsignacion = async (...params) => {
    assert.deepEqual(params, ['tenant-1', 'd1', 'docente_asesor', 'a1', null]);
    return true;
  };
  Observacion.create = async (document) => {
    savedObservation = document;
    return document;
  };

  try {
    const req = {
      tenant: { id: 'tenant-1' },
      user: { sub: 'd1' },
      body: { asignacionId: 'a1', categoria: 'seguimiento', observacion: '  Visita realizada  ' },
    };
    const res = { status: (code) => ({ json: (payload) => {
      assert.equal(code, 201);
      assert.equal(payload.observacion, 'Visita realizada');
    } }) };

    await practicasSsre.crearObservacion(req, res, () => {});
    assert.equal(savedObservation.tenantId, 'tenant-1');
    assert.equal(savedObservation.asignacionId, 'a1');
    assert.equal(savedObservation.docenteId, 'd1');
  } finally {
    postgres.query = originalQuery;
    saciClient.validarAsignacion = validarAsignacionOriginal;
    Observacion.create = originalCreate;
  }
});

test('un estudiante puede crear una solicitud de práctica', async () => {
  const originalQuery = postgres.query;
  const originalConnect = postgres.pool.connect;
  let capturedParams;
  postgres.query = async (text, params) => {
    if (String(text).includes('SELECT id FROM solicitudes_practica')) {
      return { rows: [] };
    }
    if (String(text).includes('INSERT INTO solicitudes_practica')) {
      capturedParams = params;
      return { rows: [{ id: 's1', estudiante_id: 'u1', estado: 'pendiente' }] };
    }
    return { rows: [] };
  };
  postgres.pool.connect = async () => ({
    query: async (text, params) => {
      if (String(text).includes('SELECT id FROM solicitudes_practica')) return { rows: [] };
      if (String(text).includes('INSERT INTO solicitudes_practica')) {
        capturedParams = params;
        return { rows: [{ id: 's1', estudiante_id: 'u1', estado: 'pendiente' }] };
      }
      if (String(text).includes('INSERT INTO documentos_solicitud_practica')) return { rows: [] };
      return { rows: [] };
    },
    release: () => {},
  });

  try {
    const req = {
      tenant: { id: 'tenant-1' },
      user: { sub: 'u1', rol: 'estudiante' },
      body: {
        practicaSolicitada: 'Práctica docente terminal',
        semestre: '6',
        fechaInicio: '2026-12-01',
        fechaFin: null,
        horasRequeridas: 120,
      },
      files: {
        cedula: [{ originalname: 'cedula.pdf', mimetype: 'application/pdf', buffer: Buffer.from('cedula') }],
        reciboSemestre: [{ originalname: 'recibo.pdf', mimetype: 'application/pdf', buffer: Buffer.from('recibo') }],
        certificacionMaterias: [{ originalname: 'materias.pdf', mimetype: 'application/pdf', buffer: Buffer.from('materias') }],
      },
    };
    const res = { status: (code) => ({ json: (payload) => {
      assert.equal(code, 201);
      assert.equal(payload.estado, 'pendiente');
    } }) };

    await practicasSaci.crearSolicitudPractica(req, res, () => {});
    assert.deepEqual(capturedParams, ['tenant-1', 'u1', null, 'Práctica docente terminal', 6, '2026-12-01', null, 120]);
  } finally {
    postgres.query = originalQuery;
    postgres.pool.connect = originalConnect;
  }
});

test('informa cupo disponible y máximo de 20 estudiantes por docente', async () => {
  const originalQuery = postgres.query;
  postgres.query = async (text) => {
    assert.match(String(text), /COUNT\(a\.id\)/);
    return {
      rows: [
        { id: 'd1', nombre_completo: 'Docente Uno', estudiantes_activos: 18 },
        { id: 'd2', nombre_completo: 'Docente Dos', estudiantes_activos: 20 },
      ],
    };
  };

  try {
    const req = { tenant: { id: 'tenant-1' }, user: { rol: 'director' } };
    const res = { json: (payload) => {
      assert.equal(payload[0].disponible, true);
      assert.equal(payload[0].capacidad_disponible, 2);
      assert.equal(payload[1].disponible, false);
      assert.equal(payload[1].capacidad_disponible, 0);
    } };

    await practicasSaci.listarDisponibilidadDocentes(req, res, () => {});
  } finally {
    postgres.query = originalQuery;
  }
});
