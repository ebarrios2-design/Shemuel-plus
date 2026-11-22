const test = require('node:test');
const assert = require('node:assert/strict');
const practicas = require('../src/controllers/practicas.controller');
const postgres = require('../src/config/postgres');
const Taller = require('../src/models/mongo/Taller');
const EntregaTaller = require('../src/models/mongo/EntregaTaller');

function respuestaFalsa() {
  return {
    statusCode: 200,
    payload: undefined,
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

test('crea talleres solo para una asignación del docente del tenant', async () => {
  const queryOriginal = postgres.query;
  const crearOriginal = Taller.create;
  let documentoGuardado;
  postgres.query = async (_sql, params) => {
    assert.deepEqual(params, ['tenant-1', 'asignacion-1', 'docente-1']);
    return { rows: [{ id: 'asignacion-1' }] };
  };
  Taller.create = async (documento) => {
    documentoGuardado = documento;
    return documento;
  };

  try {
    const req = {
      tenant: { id: 'tenant-1' },
      user: { sub: 'docente-1' },
      body: {
        asignacionId: 'asignacion-1',
        titulo: 'Taller de lectura',
        instrucciones: 'Analiza el texto y entrega tu respuesta.',
        preguntas: [{
          pregunta: '¿Cuál es la idea principal?',
          opciones: ['A', 'B'],
          respuestaCorrecta: 1,
        }],
      },
    };
    const res = respuestaFalsa();

    await practicas.crearTaller(req, res, (err) => { throw err; });

    assert.equal(res.statusCode, 201);
    assert.equal(documentoGuardado.tenantId, 'tenant-1');
    assert.equal(documentoGuardado.docenteId, 'docente-1');
    assert.equal(documentoGuardado.preguntas[0].respuestaCorrecta, 1);
  } finally {
    postgres.query = queryOriginal;
    Taller.create = crearOriginal;
  }
});

test('rechaza preguntas de quiz inválidas antes de consultar la base de datos', async () => {
  const queryOriginal = postgres.query;
  postgres.query = async () => {
    assert.fail('No debe consultar la base de datos con preguntas inválidas.');
  };

  try {
    const req = {
      tenant: { id: 'tenant-1' },
      user: { sub: 'docente-1' },
      body: {
        asignacionId: 'asignacion-1',
        titulo: 'Taller',
        instrucciones: 'Instrucciones',
        preguntas: [{
          pregunta: 'Pregunta',
          opciones: ['Única opción'],
          respuestaCorrecta: 0,
        }],
      },
    };
    const res = respuestaFalsa();

    await practicas.crearTaller(req, res, (err) => { throw err; });

    assert.equal(res.statusCode, 400);
  } finally {
    postgres.query = queryOriginal;
  }
});

test('no expone la respuesta correcta al estudiante en la lista de talleres', async () => {
  const queryOriginal = postgres.query;
  const buscarTalleresOriginal = Taller.find;
  const buscarEntregasOriginal = EntregaTaller.find;
  const taller = {
    _id: '507f1f77bcf86cd799439011',
    asignacionId: 'asignacion-1',
    quizActivado: true,
    preguntas: [{
      pregunta: '¿Cuál es correcta?',
      opciones: ['A', 'B'],
      respuestaCorrecta: 1,
    }],
  };
  postgres.query = async () => ({ rows: [{ id: 'asignacion-1' }] });
  Taller.find = () => ({
    sort() { return this; },
    lean: async () => [taller],
  });
  EntregaTaller.find = () => ({
    lean: async () => [{
      tallerId: taller._id,
      actividadEntregadaEn: new Date(),
      estudianteId: 'estudiante-1',
    }],
  });

  try {
    const req = {
      tenant: { id: 'tenant-1' },
      user: { sub: 'estudiante-1', rol: 'estudiante' },
    };
    const res = respuestaFalsa();

    await practicas.listarTalleres(req, res, (err) => { throw err; });

    assert.equal(res.payload[0].preguntas[0].pregunta, '¿Cuál es correcta?');
    assert.equal('respuestaCorrecta' in res.payload[0].preguntas[0], false);
  } finally {
    postgres.query = queryOriginal;
    Taller.find = buscarTalleresOriginal;
    EntregaTaller.find = buscarEntregasOriginal;
  }
});

test('permite una entrega tardía y acredita sus tres horas una sola vez', async () => {
  const queryOriginal = postgres.query;
  const buscarTallerOriginal = Taller.findOne;
  const buscarEntregaOriginal = EntregaTaller.findOne;
  const actualizarEntregaOriginal = EntregaTaller.findOneAndUpdate;
  let busquedasEntrega = 0;
  let actualizacionesEntrega = 0;
  let queryHoras;

  postgres.query = async (sql, params) => {
    if (sql.includes('UPDATE asignaciones_practica')) {
      queryHoras = params;
      return { rows: [{ id: 'asignacion-1' }] };
    }
    return { rows: [{ id: 'asignacion-1' }] };
  };
  Taller.findOne = async () => ({
    _id: '507f1f77bcf86cd799439011',
    asignacionId: 'asignacion-1',
  });
  EntregaTaller.findOne = async () => {
    busquedasEntrega += 1;
    if (busquedasEntrega === 1) return null;
    return { actividadIniciadaEn: new Date(Date.now() - 3 * 60 * 60 * 1000 - 1000) };
  };
  EntregaTaller.findOneAndUpdate = async (_filtro, actualizacion) => {
    actualizacionesEntrega += 1;
    if (actualizacionesEntrega === 1) {
      return {
        _id: 'entrega-1',
        actividadEntregadaEn: actualizacion.$set.actividadEntregadaEn,
        entregaTardia: actualizacion.$set.entregaTardia,
      };
    }
    return { _id: 'entrega-1' };
  };

  try {
    const req = {
      tenant: { id: 'tenant-1' },
      user: { sub: 'estudiante-1' },
      params: { id: '507f1f77bcf86cd799439011' },
      body: { comentario: 'Entrega final' },
      file: {
        originalname: 'actividad.pdf',
        mimetype: 'application/pdf',
        buffer: Buffer.from('archivo'),
      },
    };
    const res = respuestaFalsa();

    await practicas.entregarActividad(req, res, (err) => { throw err; });

    assert.equal(res.statusCode, 201);
    assert.equal(res.payload.entregaTardia, true);
    assert.equal(res.payload.horasActividad, 3);
    assert.deepEqual(queryHoras, [3, 'tenant-1', 'asignacion-1']);
    assert.equal(actualizacionesEntrega, 2);
  } finally {
    postgres.query = queryOriginal;
    Taller.findOne = buscarTallerOriginal;
    EntregaTaller.findOne = buscarEntregaOriginal;
    EntregaTaller.findOneAndUpdate = actualizarEntregaOriginal;
  }
});

test('califica el quiz en el servidor y acredita una hora al finalizar', async () => {
  const queryOriginal = postgres.query;
  const buscarTallerOriginal = Taller.findOne;
  const buscarEntregaOriginal = EntregaTaller.findOne;
  const actualizarEntregaOriginal = EntregaTaller.findOneAndUpdate;
  const preguntas = [
    { pregunta: 'Pregunta 1', opciones: ['A', 'B'], respuestaCorrecta: 0 },
    { pregunta: 'Pregunta 2', opciones: ['A', 'B'], respuestaCorrecta: 1 },
  ];
  const entrega = {
    _id: 'entrega-2',
    quizIniciadoEn: new Date(),
    respuestas: [],
    save: async () => {},
  };
  let queryHoras;

  postgres.query = async (sql, params) => {
    if (sql.includes('UPDATE asignaciones_practica')) {
      queryHoras = params;
      return { rows: [{ id: 'asignacion-1' }] };
    }
    return { rows: [{ id: 'asignacion-1' }] };
  };
  Taller.findOne = async () => ({ _id: '507f1f77bcf86cd799439011', asignacionId: 'asignacion-1', preguntas });
  EntregaTaller.findOne = async () => entrega;
  EntregaTaller.findOneAndUpdate = async () => ({ _id: 'entrega-2' });

  try {
    const req = {
      tenant: { id: 'tenant-1' },
      user: { sub: 'estudiante-1' },
      params: { id: '507f1f77bcf86cd799439011' },
      body: { respuestas: [0, 1] },
    };
    const res = respuestaFalsa();

    await practicas.finalizarQuiz(req, res, (err) => { throw err; });

    assert.equal(res.payload.puntaje, 100);
    assert.equal(res.payload.totalPreguntas, 2);
    assert.deepEqual(queryHoras, [1, 'tenant-1', 'asignacion-1']);
    assert.ok(entrega.quizFinalizadoEn instanceof Date);
  } finally {
    postgres.query = queryOriginal;
    Taller.findOne = buscarTallerOriginal;
    EntregaTaller.findOne = buscarEntregaOriginal;
    EntregaTaller.findOneAndUpdate = actualizarEntregaOriginal;
  }
});
