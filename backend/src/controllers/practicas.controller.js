/**
 * Controlador central del modulo de practicas.
 *
 * Hace la union entre dos fuentes de verdad:
 * - PostgreSQL: asignaciones, docentes, estudiantes e instituciones receptoras
 * - MongoDB: planes de clase y observaciones pedagogicas
 *
 * La clave es que todas las consultas se filtran con req.tenant.id para
 * mantener el aislamiento de cada universidad.
 */
const postgres = require('../config/postgres');
const query = (...args) => postgres.query(...args);
const PlanClase = require('../models/mongo/PlanClase');
const Observacion = require('../models/mongo/Observacion');
const Taller = require('../models/mongo/Taller');
const EntregaTaller = require('../models/mongo/EntregaTaller');
const { mongoose } = require('../config/mongo');

const DURACION_ACTIVIDAD_MS = 3 * 60 * 60 * 1000;
const DURACION_QUIZ_MS = 60 * 60 * 1000;

function responderError(res, status, error) {
  return res.status(status).json({ error });
}

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
  const columna = rol === 'docente_asesor' ? 'docente_id' : 'estudiante_id';
  const { rows } = await query(
    `SELECT id
     FROM asignaciones_practica
     WHERE institucion_id = $1 AND id = $2 AND ${columna} = $3`,
    [req.tenant.id, taller.asignacionId, req.user.sub]
  );
  return rows.length > 0;
}

async function acreditarHoras(req, asignacionId, horas, campoAcreditacion, entregaId) {
  const reclamo = await EntregaTaller.findOneAndUpdate(
    { _id: entregaId, [campoAcreditacion]: false },
    { $set: { [campoAcreditacion]: true } },
    { new: true }
  );
  if (!reclamo) return;

  try {
    const { rows } = await query(
      `UPDATE asignaciones_practica
       SET horas_cumplidas = LEAST(horas_requeridas, horas_cumplidas + $1),
           estado = CASE
             WHEN LEAST(horas_requeridas, horas_cumplidas + $1) >= horas_requeridas THEN 'finalizada'::estado_asignacion
             ELSE 'en_curso'::estado_asignacion
           END
       WHERE institucion_id = $2 AND id = $3
       RETURNING id`,
      [horas, req.tenant.id, asignacionId]
    );
    if (rows.length === 0) throw new Error('No se encontró la asignación para acreditar las horas.');
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
    const columna = req.user.rol === 'docente_asesor' ? 'docente_id' : 'estudiante_id';
    const { rows } = await query(
      `SELECT id
       FROM asignaciones_practica
       WHERE institucion_id = $1 AND ${columna} = $2`,
      [req.tenant.id, req.user.sub]
    );
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
    const idsEstudiantes = [...new Set(entregas.map((entrega) => entrega.estudianteId))];
    const nombresEstudiantes = idsEstudiantes.length
      ? await query(
        'SELECT id, nombre_completo FROM usuarios WHERE institucion_id = $1 AND id = ANY($2::uuid[])',
        [req.tenant.id, idsEstudiantes]
      )
      : { rows: [] };
    const nombrePorId = new Map(nombresEstudiantes.rows.map((row) => [row.id, row.nombre_completo]));
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

    const { rows } = await query(
      `SELECT id
       FROM asignaciones_practica
       WHERE institucion_id = $1 AND id = $2 AND docente_id = $3`,
      [req.tenant.id, asignacionId, req.user.sub]
    );
    if (rows.length === 0) {
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
      const { rows } = await query(
        `SELECT id
         FROM asignaciones_practica
         WHERE institucion_id = $1 AND id = $2 AND docente_id = $3 AND estudiante_id = $4`,
        [req.tenant.id, taller.asignacionId, req.user.sub, estudianteId]
      );
      if (rows.length === 0) return responderError(res, 404, 'Entrega no encontrada para este docente.');
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

// ---------- PostgreSQL: usuarios e instituciones receptoras ----------

async function listarInstitucionesReceptoras(req, res, next) {
  try {
    const { rows } = await query(
      `SELECT id, nombre, direccion, contacto_nombre, contacto_email, contacto_tel, creado_en
       FROM instituciones_receptoras
       WHERE institucion_id = $1
       ORDER BY nombre ASC`,
      [req.tenant.id]
    );
    res.json(rows);
  } catch (err) {
    next(err);
  }
}

async function crearInstitucionReceptora(req, res, next) {
  try {
    const { nombre, direccion, contactoNombre, contactoEmail, contactoTel } = req.body;

    if (!nombre) {
      return res.status(400).json({ error: 'El nombre de la institución receptora es obligatorio.' });
    }

    const { rows } = await query(
      `INSERT INTO instituciones_receptoras
        (institucion_id, nombre, direccion, contacto_nombre, contacto_email, contacto_tel)
       VALUES ($1, $2, $3, $4, $5, $6)
       RETURNING *`,
      [req.tenant.id, nombre.trim(), direccion || null, contactoNombre || null, contactoEmail || null, contactoTel || null]
    );

    res.status(201).json(rows[0]);
  } catch (err) {
    next(err);
  }
}

async function listarUsuariosPorRol(req, res, next) {
  try {
    const rol = req.params.rol || req.query.rol;
    const rolesValidos = ['estudiante', 'docente_asesor', 'director', 'institucion_receptora'];

    if (!rol || !rolesValidos.includes(rol)) {
      return res.status(400).json({ error: 'Rol no válido.' });
    }

    const { rows } = await query(
      `SELECT id, nombre_completo, email, rol, activo
       FROM usuarios
       WHERE institucion_id = $1 AND rol = $2 AND activo = TRUE
       ORDER BY nombre_completo ASC`,
      [req.tenant.id, rol]
    );

    res.json(rows.map((row) => ({ ...row, nombre: row.nombre_completo })));
  } catch (err) {
    next(err);
  }
}

// ---------- PostgreSQL: asignaciones de practica ----------

async function listarAsignaciones(req, res, next) {
  try {
    const { rows } = await query(
      `SELECT a.*, e.nombre_completo AS estudiante, d.nombre_completo AS docente,
              COALESCE(ir.nombre, i.nombre) AS institucion
       FROM asignaciones_practica a
       JOIN usuarios e ON e.id = a.estudiante_id
       JOIN usuarios d ON d.id = a.docente_id
       LEFT JOIN instituciones_receptoras ir ON ir.id = a.institucion_receptora_id
       JOIN instituciones i ON i.id = a.institucion_id
       WHERE a.institucion_id = $1
       ORDER BY a.creado_en DESC`,
      [req.tenant.id]
    );
    res.json(rows);
  } catch (err) {
    next(err);
  }
}

async function crearAsignacion(req, res, next) {
  try {
    const {
      estudianteId,
      docenteId,
      institucionReceptoraId,
      fechaInicio,
      fechaFin,
      horasRequeridas,
    } = req.body;

    const { rows } = await query(
      `INSERT INTO asignaciones_practica
        (institucion_id, estudiante_id, docente_id, institucion_receptora_id,
         fecha_inicio, fecha_fin, horas_requeridas)
       VALUES ($1,$2,$3,$4,$5,$6,$7)
       RETURNING *`,
      [req.tenant.id, estudianteId, docenteId, institucionReceptoraId || null, fechaInicio, fechaFin, horasRequeridas]
    );

    res.status(201).json(rows[0]);
  } catch (err) {
    next(err);
  }
}

async function actualizarHorasAsignacion(req, res, next) {
  try {
    const { id } = req.params;
    const horasCumplidas = Number(req.body.horasCumplidas ?? req.body.horas_cumplidas ?? 0);

    if (!Number.isFinite(horasCumplidas) || horasCumplidas < 0) {
      return res.status(400).json({ error: 'Las horas cumplidas deben ser un número válido.' });
    }

    const { rows } = await query(
      `UPDATE asignaciones_practica
       SET horas_cumplidas = $1,
           estado = CASE
             WHEN $1 >= horas_requeridas THEN 'finalizada'::estado_asignacion
             WHEN $1 > 0 THEN 'en_curso'::estado_asignacion
             ELSE 'pendiente'::estado_asignacion
           END
       WHERE institucion_id = $2 AND id = $3
       RETURNING *`,
      [horasCumplidas, req.tenant.id, id]
    );

    if (rows.length === 0) {
      return res.status(404).json({ error: 'Asignación no encontrada en esta institución.' });
    }

    res.json(rows[0]);
  } catch (err) {
    next(err);
  }
}

async function crearEvaluacion(req, res, next) {
  try {
    const { asignacionId, calificacion, observacion } = req.body;
    const nota = Number(calificacion);

    if (!asignacionId || !Number.isFinite(nota) || nota < 0 || nota > 5) {
      return res.status(400).json({ error: 'Debe indicar una asignación y una calificación entre 0 y 5.' });
    }

    const { rows } = await query(
      `INSERT INTO evaluaciones (institucion_id, asignacion_id, docente_id, calificacion)
       VALUES ($1, $2, $3, $4)
       RETURNING *`,
      [req.tenant.id, asignacionId, req.user.sub, nota]
    );

    res.status(201).json(rows[0]);
  } catch (err) {
    next(err);
  }
}

async function listarEvaluaciones(req, res, next) {
  try {
    const { asignacionId } = req.query;
    const params = [req.tenant.id];
    let filtro = 'WHERE e.institucion_id = $1';

    if (asignacionId) {
      filtro += ' AND e.asignacion_id = $2';
      params.push(asignacionId);
    }

    const { rows } = await query(
      `SELECT e.*, u.nombre_completo AS docente
       FROM evaluaciones e
       JOIN usuarios u ON u.id = e.docente_id
       ${filtro}
       ORDER BY e.creado_en DESC`,
      params
    );

    res.json(rows);
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

    const { rows } = await query(
      `SELECT id
       FROM asignaciones_practica
       WHERE institucion_id = $1 AND id = $2 AND docente_id = $3`,
      [req.tenant.id, asignacionId, req.user.sub]
    );

    if (rows.length === 0) {
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
  listarInstitucionesReceptoras,
  crearInstitucionReceptora,
  listarUsuariosPorRol,
  listarAsignaciones,
  crearAsignacion,
  actualizarHorasAsignacion,
  crearEvaluacion,
  listarEvaluaciones,
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
