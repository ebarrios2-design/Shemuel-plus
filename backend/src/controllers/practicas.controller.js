const { query } = require('../config/postgres');
const PlanClase = require('../models/mongo/PlanClase');
const Observacion = require('../models/mongo/Observacion');

// ---------- PostgreSQL: asignaciones de practica ----------

async function listarAsignaciones(req, res, next) {
  try {
    const { rows } = await query(
      `SELECT a.*, e.nombre_completo AS estudiante, d.nombre_completo AS docente,
              ir.nombre AS institucion_receptora
       FROM asignaciones_practica a
       JOIN usuarios e ON e.id = a.estudiante_id
       JOIN usuarios d ON d.id = a.docente_id
       JOIN instituciones_receptoras ir ON ir.id = a.institucion_receptora_id
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
      [req.tenant.id, estudianteId, docenteId, institucionReceptoraId, fechaInicio, fechaFin, horasRequeridas]
    );

    res.status(201).json(rows[0]);
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

    const doc = await Observacion.create({
      tenantId: req.tenant.id,
      asignacionId,
      docenteId: req.user.sub,
      categoria,
      observacion,
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
  listarAsignaciones,
  crearAsignacion,
  crearPlanClase,
  listarPlanesClase,
  crearObservacion,
  listarObservaciones,
};
