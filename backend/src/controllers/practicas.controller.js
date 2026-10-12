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
};
