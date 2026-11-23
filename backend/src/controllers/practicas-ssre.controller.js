/** Document and workshop handlers owned by SSRE (MongoDB). */
const saciClient = require('../services/saciClient');
const PlanClase = require('../models/mongo/PlanClase');
const Observacion = require('../models/mongo/Observacion');
const Taller = require('../models/mongo/Taller');
const EntregaTaller = require('../models/mongo/EntregaTaller');
const { mongoose } = require('../config/mongo');
const { responderError } = require('../utils/http');

const DURACION_ACTIVIDAD_MS = 3 * 60 * 60 * 1000;
const DURACION_QUIZ_MS = 60 * 60 * 1000;

async function buscarTaller(req, res) {
  if (!mongoose.Types.ObjectId.isValid(req.params.id)) {
    responderError(res, 400, 'Identificador de taller no válido.');
    return null;
  }

  const taller = await Taller.findOne({ _id: req.params.id, tenantId: req.tenant.id });
  if (!taller) responderError(res, 404, 'Taller no encontrado en esta institución.');
  return taller;
}

async function verificarAsignacion(req, taller, rol) {
  return saciClient.validarAsignacion(
    req.tenant.id,
    req.user.sub,
    rol,
    taller.asignacionId
  );
}

async function acreditarHoras(req, asignacionId, horas, campoAcreditacion, entregaId) {
  const reclamo = await EntregaTaller.findOneAndUpdate(
    { _id: entregaId, [campoAcreditacion]: false },
    { $set: { [campoAcreditacion]: true } },
    { new: true }
  );
  if (!reclamo) return;

  try {
    await saciClient.acreditarHoras(
      req.tenant.id,
      asignacionId,
      horas,
      `${campoAcreditacion}:${entregaId}`
    );
  } catch (err) {
    await EntregaTaller.updateOne({ _id: entregaId }, { $set: { [campoAcreditacion]: false } });
    throw err;
  }
}

function validarPreguntas(preguntas) {
  return Array.isArray(preguntas)
    && preguntas.length >= 1
    && preguntas.length <= 20
    && preguntas.every((item) => (
      typeof item.pregunta === 'string'
      && item.pregunta.trim().length > 0
      && item.pregunta.trim().length <= 500
      && Array.isArray(item.opciones)
      && item.opciones.length >= 2
      && item.opciones.length <= 6
      && item.opciones.every((opcion) => (
        typeof opcion === 'string'
        && opcion.trim().length > 0
        && opcion.trim().length <= 250
      ))
      && Number.isInteger(item.respuestaCorrecta)
      && item.respuestaCorrecta >= 0
      && item.respuestaCorrecta < item.opciones.length
    ));
}

// ---------- Talleres y quizzes de práctica ----------

async function listarTalleres(req, res, next) {
  try {
    const rows = await saciClient.listarAsignaciones(req.tenant.id, req.user.sub, req.user.rol);
    const asignacionIds = rows.map((row) => row.id);
    if (asignacionIds.length === 0) return res.json([]);

    const talleres = await Taller.find({
      tenantId: req.tenant.id,
      asignacionId: { $in: asignacionIds },
    }).sort({ createdAt: -1 }).lean();

    if (req.user.rol === 'estudiante') {
      const entregas = await EntregaTaller.find({
        tenantId: req.tenant.id,
        tallerId: { $in: talleres.map((taller) => taller._id) },
        estudianteId: req.user.sub,
      }, '-archivo.datos').lean();
      const entregasPorTaller = new Map(entregas.map((entrega) => [String(entrega.tallerId), entrega]));

      return res.json(talleres.map((taller) => {
        const entrega = entregasPorTaller.get(String(taller._id)) || null;
        const preguntas = taller.quizActivado && entrega?.actividadEntregadaEn
          ? taller.preguntas.map(({ pregunta, opciones }) => ({ pregunta, opciones }))
          : [];
        return { ...taller, preguntas, entrega };
      }));
    }

    const entregas = await EntregaTaller.find({
      tenantId: req.tenant.id,
      tallerId: { $in: talleres.map((taller) => taller._id) },
    }, '-archivo.datos').lean();
    const nombrePorId = new Map(rows.map((row) => [row.estudiante_id, row.estudiante]));
    const entregasPorTaller = new Map();
    for (const entrega of entregas) {
      entrega.estudiante = nombrePorId.get(entrega.estudianteId) || 'Estudiante';
      const lista = entregasPorTaller.get(String(entrega.tallerId)) || [];
      lista.push(entrega);
      entregasPorTaller.set(String(entrega.tallerId), lista);
    }

    res.json(talleres.map((taller) => ({
      ...taller,
      entregas: entregasPorTaller.get(String(taller._id)) || [],
    })));
  } catch (err) {
    next(err);
  }
}

async function crearTaller(req, res, next) {
  try {
    const { asignacionId, titulo, instrucciones, preguntas } = req.body;
    if (!asignacionId || typeof titulo !== 'string' || !titulo.trim() || titulo.trim().length > 150
      || typeof instrucciones !== 'string' || !instrucciones.trim() || instrucciones.trim().length > 4000
      || !validarPreguntas(preguntas)) {
      return responderError(res, 400, 'Indica título, instrucciones y entre 1 y 20 preguntas válidas.');
    }

    if (!await saciClient.validarAsignacion(
      req.tenant.id,
      req.user.sub,
      'docente_asesor',
      asignacionId
    )) {
      return responderError(res, 404, 'Asignación no encontrada para este docente e institución.');
    }

    const taller = await Taller.create({
      tenantId: req.tenant.id,
      asignacionId,
      docenteId: req.user.sub,
      titulo: titulo.trim(),
      instrucciones: instrucciones.trim(),
      preguntas: preguntas.map((item) => ({
        pregunta: item.pregunta.trim(),
        opciones: item.opciones.map((opcion) => opcion.trim()),
        respuestaCorrecta: item.respuestaCorrecta,
      })),
    });
    res.status(201).json(taller);
  } catch (err) {
    next(err);
  }
}

async function activarQuiz(req, res, next) {
  try {
    const taller = await buscarTaller(req, res);
    if (!taller) return;
    if (!await verificarAsignacion(req, taller, 'docente_asesor')) {
      return responderError(res, 404, 'Taller no asignado a este docente.');
    }
    if (!taller.preguntas.length) {
      return responderError(res, 400, 'Agrega preguntas antes de activar el quiz.');
    }

    taller.quizActivado = true;
    await taller.save();
    res.json({ quizActivado: taller.quizActivado });
  } catch (err) {
    next(err);
  }
}

async function iniciarActividad(req, res, next) {
  try {
    const taller = await buscarTaller(req, res);
    if (!taller) return;
    if (!await verificarAsignacion(req, taller, 'estudiante')) {
      return responderError(res, 404, 'Taller no asignado a este estudiante.');
    }

    let entrega = await EntregaTaller.findOne({
      tenantId: req.tenant.id,
      tallerId: taller._id,
      estudianteId: req.user.sub,
    });
    if (entrega?.actividadEntregadaEn) {
      return responderError(res, 409, 'La actividad ya fue entregada.');
    }
    if (!entrega) {
      try {
        entrega = await EntregaTaller.create({
          tenantId: req.tenant.id,
          tallerId: taller._id,
          asignacionId: taller.asignacionId,
          estudianteId: req.user.sub,
          actividadIniciadaEn: new Date(),
        });
      } catch (err) {
        if (err.code !== 11000) throw err;
        entrega = await EntregaTaller.findOne({
          tenantId: req.tenant.id,
          tallerId: taller._id,
          estudianteId: req.user.sub,
        });
      }
    }
    res.json({ actividadIniciadaEn: entrega.actividadIniciadaEn });
  } catch (err) {
    next(err);
  }
}

async function entregarActividad(req, res, next) {
  try {
    const taller = await buscarTaller(req, res);
    if (!taller) return;
    if (!await verificarAsignacion(req, taller, 'estudiante')) {
      return responderError(res, 404, 'Taller no asignado a este estudiante.');
    }
    const entregaExistente = await EntregaTaller.findOne({
      tenantId: req.tenant.id,
      tallerId: taller._id,
      estudianteId: req.user.sub,
      actividadEntregadaEn: { $exists: true },
    });
    if (entregaExistente) {
      await acreditarHoras(
        req,
        taller.asignacionId,
        3,
        'horasActividadAcreditadas',
        entregaExistente._id
      );
      return res.json({
        actividadEntregadaEn: entregaExistente.actividadEntregadaEn,
        entregaTardia: entregaExistente.entregaTardia,
        horasActividad: 3,
      });
    }
    if (!req.file) return responderError(res, 400, 'Adjunta el archivo de la actividad.');
    if (req.file.originalname.length > 255) {
      return responderError(res, 400, 'El nombre del archivo no puede superar 255 caracteres.');
    }
    const comentario = typeof req.body?.comentario === 'string' ? req.body.comentario.trim() : '';
    if (comentario.length > 2000) return responderError(res, 400, 'El comentario no puede superar 2000 caracteres.');

    const filtro = {
      tenantId: req.tenant.id,
      tallerId: taller._id,
      estudianteId: req.user.sub,
      actividadIniciadaEn: { $exists: true },
      actividadEntregadaEn: { $exists: false },
    };
    const entrega = await EntregaTaller.findOne(filtro);
    if (!entrega) return responderError(res, 409, 'Inicia la actividad antes de entregarla o ya fue enviada.');

    const ahora = new Date();
    const entregaActualizada = await EntregaTaller.findOneAndUpdate(filtro, {
      $set: {
        archivo: {
          nombre: req.file.originalname,
          tipo: req.file.mimetype,
          datos: req.file.buffer,
        },
        comentario,
        actividadEntregadaEn: ahora,
        entregaTardia: ahora.getTime() > new Date(entrega.actividadIniciadaEn).getTime() + DURACION_ACTIVIDAD_MS,
      },
    }, { new: true });
    if (!entregaActualizada) return responderError(res, 409, 'La actividad ya fue enviada.');

    await acreditarHoras(
      req,
      taller.asignacionId,
      3,
      'horasActividadAcreditadas',
      entregaActualizada._id
    );
    res.status(201).json({
      actividadEntregadaEn: entregaActualizada.actividadEntregadaEn,
      entregaTardia: entregaActualizada.entregaTardia,
      horasActividad: 3,
    });
  } catch (err) {
    next(err);
  }
}

async function descargarActividad(req, res, next) {
  try {
    const taller = await buscarTaller(req, res);
    if (!taller) return;
    const filtro = { tenantId: req.tenant.id, tallerId: taller._id };
    if (req.user.rol === 'estudiante') {
      if (!await verificarAsignacion(req, taller, 'estudiante')) {
        return responderError(res, 404, 'Taller no asignado a este usuario.');
      }
      filtro.estudianteId = req.user.sub;
    } else {
      const { estudianteId } = req.query;
      if (!estudianteId) return responderError(res, 400, 'Indica el estudiante de la entrega.');
      const autorizado = await saciClient.validarAsignacion(
        req.tenant.id,
        req.user.sub,
        'docente_asesor',
        taller.asignacionId,
        estudianteId
      );
      if (!autorizado) return responderError(res, 404, 'Entrega no encontrada para este docente.');
      filtro.estudianteId = estudianteId;
    }
    const entrega = await EntregaTaller.findOne(filtro);
    if (!entrega?.archivo?.datos) return responderError(res, 404, 'No hay archivo entregado.');

    res.set({
      'Content-Type': entrega.archivo.tipo,
      'Content-Disposition': `attachment; filename*=UTF-8''${encodeURIComponent(entrega.archivo.nombre)}`,
      'X-Content-Type-Options': 'nosniff',
    });
    res.send(entrega.archivo.datos);
  } catch (err) {
    next(err);
  }
}

async function iniciarQuiz(req, res, next) {
  try {
    const taller = await buscarTaller(req, res);
    if (!taller) return;
    if (!await verificarAsignacion(req, taller, 'estudiante')) {
      return responderError(res, 404, 'Taller no asignado a este estudiante.');
    }
    if (!taller.quizActivado) return responderError(res, 403, 'El docente todavía no ha activado este quiz.');

    const filtro = {
      tenantId: req.tenant.id,
      tallerId: taller._id,
      estudianteId: req.user.sub,
      actividadEntregadaEn: { $exists: true },
      quizFinalizadoEn: { $exists: false },
    };
    let entrega = await EntregaTaller.findOne(filtro);
    if (!entrega) return responderError(res, 409, 'Primero debes entregar la actividad.');
    if (!entrega.quizIniciadoEn) {
      entrega = await EntregaTaller.findOneAndUpdate(
        { ...filtro, quizIniciadoEn: { $exists: false } },
        { $set: { quizIniciadoEn: new Date() } },
        { new: true }
      );
      if (!entrega) entrega = await EntregaTaller.findOne(filtro);
    }
    res.json({ quizIniciadoEn: entrega.quizIniciadoEn, preguntas: taller.preguntas.map(({ pregunta, opciones }) => ({ pregunta, opciones })) });
  } catch (err) {
    next(err);
  }
}

function validarRespuestas(respuestas, preguntas) {
  return Array.isArray(respuestas)
    && respuestas.length === preguntas.length
    && respuestas.every((respuesta, indice) => (
      Number.isInteger(respuesta)
      && respuesta >= 0
      && respuesta < preguntas[indice].opciones.length
    ));
}

async function guardarRespuestasQuiz(req, res, next) {
  try {
    const taller = await buscarTaller(req, res);
    if (!taller) return;
    if (!await verificarAsignacion(req, taller, 'estudiante')) {
      return responderError(res, 404, 'Taller no asignado a este estudiante.');
    }
    const filtro = {
      tenantId: req.tenant.id,
      tallerId: taller._id,
      estudianteId: req.user.sub,
      quizFinalizadoEn: { $exists: false },
      quizIniciadoEn: { $exists: true },
    };
    const entrega = await EntregaTaller.findOne(filtro);
    if (!entrega) return responderError(res, 409, 'No hay un quiz activo para este taller.');
    if (Date.now() > new Date(entrega.quizIniciadoEn).getTime() + DURACION_QUIZ_MS) {
      return responderError(res, 410, 'El tiempo del quiz terminó.');
    }
    const respuestas = req.body?.respuestas;
    if (!Array.isArray(respuestas)
      || respuestas.length !== taller.preguntas.length
      || respuestas.some((opcion, indice) => (
        opcion !== null && (!Number.isInteger(opcion) || opcion < 0 || opcion >= taller.preguntas[indice].opciones.length)
      ))) {
      return responderError(res, 400, 'Las respuestas del quiz no tienen un formato válido.');
    }

    await EntregaTaller.updateOne(filtro, {
      $set: {
        respuestas: respuestas.flatMap((opcion, pregunta) => (
          opcion === null ? [] : [{ pregunta, opcion }]
        )),
      },
    });
    res.json({ guardadas: true });
  } catch (err) {
    next(err);
  }
}

async function finalizarQuiz(req, res, next) {
  try {
    const taller = await buscarTaller(req, res);
    if (!taller) return;
    if (!await verificarAsignacion(req, taller, 'estudiante')) {
      return responderError(res, 404, 'Taller no asignado a este estudiante.');
    }
    const filtro = {
      tenantId: req.tenant.id,
      tallerId: taller._id,
      estudianteId: req.user.sub,
      quizIniciadoEn: { $exists: true },
    };
    const entrega = await EntregaTaller.findOne(filtro);
    if (!entrega) return responderError(res, 409, 'No hay un quiz activo para este taller.');
    if (entrega.quizFinalizadoEn) {
      await acreditarHoras(req, taller.asignacionId, 1, 'horasQuizAcreditadas', entrega._id);
      return res.json({ puntaje: entrega.puntaje, totalPreguntas: taller.preguntas.length, horasQuiz: 1 });
    }

    const vencido = Date.now() > new Date(entrega.quizIniciadoEn).getTime() + DURACION_QUIZ_MS;
    if (!vencido && req.body?.respuestas !== undefined) {
      if (!validarRespuestas(req.body.respuestas, taller.preguntas)) {
        return responderError(res, 400, 'Responde todas las preguntas antes de finalizar.');
      }
      entrega.respuestas = req.body.respuestas.map((opcion, pregunta) => ({ pregunta, opcion }));
    }
    const correctas = taller.preguntas.reduce((total, pregunta, indice) => (
      total + Number(entrega.respuestas.find((respuesta) => respuesta.pregunta === indice)?.opcion === pregunta.respuestaCorrecta)
    ), 0);
    entrega.puntaje = Math.round((correctas / taller.preguntas.length) * 100);
    entrega.quizFinalizadoEn = new Date();
    await entrega.save();
    await acreditarHoras(req, taller.asignacionId, 1, 'horasQuizAcreditadas', entrega._id);
    res.json({ puntaje: entrega.puntaje, totalPreguntas: taller.preguntas.length, horasQuiz: 1 });
  } catch (err) {
    next(err);
  }
}

// ---------- MongoDB: planes de clase ----------

async function crearPlanClase(req, res, next) {
  try {
    const { asignacionId, titulo, area, objetivos, contenido, archivoUrl } = req.body;

    const plan = await PlanClase.create({
      tenantId: req.tenant.id,
      asignacionId,
      estudianteId: req.user.sub,
      titulo,
      area,
      objetivos,
      contenido,
      archivoUrl,
    });

    res.status(201).json(plan);
  } catch (err) {
    next(err);
  }
}

async function listarPlanesClase(req, res, next) {
  try {
    const { asignacionId } = req.query;
    const filtro = { tenantId: req.tenant.id };
    if (asignacionId) filtro.asignacionId = asignacionId;

    const planes = await PlanClase.find(filtro).sort({ createdAt: -1 });
    res.json(planes);
  } catch (err) {
    next(err);
  }
}

// ---------- MongoDB: observaciones pedagogicas ----------

async function crearObservacion(req, res, next) {
  try {
    const { asignacionId, categoria, observacion, evidenciasUrls } = req.body;

    if (!asignacionId || typeof observacion !== 'string' || !observacion.trim()) {
      return res.status(400).json({ error: 'Debe indicar la asignación y el contenido del seguimiento.' });
    }

    const autorizado = await saciClient.validarAsignacion(
      req.tenant.id,
      req.user.sub,
      'docente_asesor',
      asignacionId,
      null
    );
    if (!autorizado) {
      return res.status(404).json({ error: 'Asignación no encontrada para este docente e institución.' });
    }

    const doc = await Observacion.create({
      tenantId: req.tenant.id,
      asignacionId,
      docenteId: req.user.sub,
      categoria,
      observacion: observacion.trim(),
      evidenciasUrls,
    });

    res.status(201).json(doc);
  } catch (err) {
    next(err);
  }
}

async function listarObservaciones(req, res, next) {
  try {
    const { asignacionId } = req.query;
    const filtro = { tenantId: req.tenant.id };
    if (asignacionId) filtro.asignacionId = asignacionId;

    const observaciones = await Observacion.find(filtro).sort({ fecha: -1 });
    res.json(observaciones);
  } catch (err) {
    next(err);
  }
}

module.exports = {
  crearPlanClase,
  listarPlanesClase,
  crearObservacion,
  listarObservaciones,
  listarTalleres,
  crearTaller,
  activarQuiz,
  iniciarActividad,
  entregarActividad,
  descargarActividad,
  iniciarQuiz,
  guardarRespuestasQuiz,
  finalizarQuiz,
};
