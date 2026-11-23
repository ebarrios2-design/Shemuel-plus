/** Relational practice handlers owned by SACI (PostgreSQL). */
const postgres = require('../config/postgres');
const query = (...args) => postgres.query(...args);
const { responderError } = require('../utils/http');

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

async function crearSolicitudPractica(req, res, next) {
  const client = await postgres.pool.connect();
  try {
    const {
      practicaSolicitada,
      semestre,
      fechaInicio,
      fechaFin,
      horasRequeridas,
    } = req.body;
    const horas = Number(horasRequeridas);
    const semestreNumero = Number(semestre);
    const practica = typeof practicaSolicitada === 'string' ? practicaSolicitada.trim() : '';
    const practicasBasicas = [
      'Práctica de observación o inmersión',
      'Práctica formativa o de intervención',
    ];
    const practicasAvanzadas = [
      'Práctica pedagógica investigativa',
      'Práctica docente terminal',
    ];
    const practicasPermitidas = semestreNumero >= 6
      ? [...practicasBasicas, ...practicasAvanzadas]
      : semestreNumero >= 4
        ? practicasBasicas
        : [];

    if (!Number.isInteger(semestreNumero) || semestreNumero < 1 || semestreNumero > 10) {
      return responderError(res, 400, 'Debe indicar un semestre válido entre 1 y 10.');
    }
    if (semestreNumero < 4) {
      return responderError(res, 400, 'Las prácticas se habilitan desde el cuarto semestre.');
    }
    if (!practicasPermitidas.includes(practica)) {
      return responderError(res, 400, 'La práctica seleccionada no está habilitada para ese semestre.');
    }
    if (!fechaInicio || !Number.isFinite(horas) || horas <= 0) {
      return responderError(res, 400, 'Debe indicar fecha de inicio y horas requeridas válidas.');
    }

    const requiredFiles = ['cedula', 'reciboSemestre', 'certificacionMaterias'];
    const faltantes = requiredFiles.filter((tipo) => !req.files?.[tipo]?.[0]);
    if (faltantes.length > 0) {
      return responderError(res, 400, `Faltan documentos obligatorios: ${faltantes.join(', ')}.`);
    }

    await client.query('BEGIN');
    const duplicada = await client.query(
      `SELECT id FROM solicitudes_practica
       WHERE institucion_id = $1 AND estudiante_id = $2
         AND estado = 'pendiente'::estado_solicitud_practica`,
      [req.tenant.id, req.user.sub]
    );
    if (duplicada.rows.length > 0) {
      await client.query('ROLLBACK');
      return responderError(res, 409, 'Ya tienes una solicitud de práctica pendiente.');
    }

    const { rows } = await client.query(
      `INSERT INTO solicitudes_practica
        (institucion_id, estudiante_id, institucion_receptora_id,
         practica_solicitada, semestre, fecha_inicio, fecha_fin, horas_requeridas)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8)
       RETURNING *`,
      [req.tenant.id, req.user.sub, null, practica, semestreNumero, fechaInicio, fechaFin || null, horas]
    );

    for (const tipo of requiredFiles) {
      const file = req.files[tipo][0];
      await client.query(
        `INSERT INTO documentos_solicitud_practica
          (solicitud_id, tipo_documento, nombre_archivo, tipo_mime, contenido)
         VALUES ($1,$2,$3,$4,$5)`,
        [rows[0].id, tipo, file.originalname.slice(0, 255), file.mimetype, file.buffer]
      );
    }

    await client.query('COMMIT');
    res.status(201).json(rows[0]);
  } catch (err) {
    await client.query('ROLLBACK').catch(() => {});
    next(err);
  } finally {
    client.release();
  }
}

async function listarSolicitudesPractica(req, res, next) {
  try {
    const params = [req.tenant.id];
    let filtro = 'WHERE s.institucion_id = $1';

    if (req.user.rol === 'estudiante') {
      filtro += ' AND s.estudiante_id = $2';
      params.push(req.user.sub);
    } else if (req.user.rol !== 'director') {
      return responderError(res, 403, 'No tienes permisos para consultar solicitudes.');
    }

    const { rows } = await query(
      `SELECT s.*, e.nombre_completo AS estudiante,
              ir.nombre AS institucion_receptora,
              a.docente_id, d.nombre_completo AS docente
       FROM solicitudes_practica s
       JOIN usuarios e ON e.id = s.estudiante_id
       LEFT JOIN instituciones_receptoras ir ON ir.id = s.institucion_receptora_id
       LEFT JOIN asignaciones_practica a ON a.id = s.asignacion_id
       LEFT JOIN usuarios d ON d.id = a.docente_id
       ${filtro}
       ORDER BY
         CASE WHEN s.estado = 'pendiente'::estado_solicitud_practica THEN 0 ELSE 1 END,
         s.creado_en DESC`,
      params
    );

    if (rows.length === 0) return res.json([]);

    const documentos = await query(
      `SELECT ds.solicitud_id, ds.tipo_documento, ds.nombre_archivo,
              ds.tipo_mime, ds.verificado, ds.creado_en
       FROM documentos_solicitud_practica ds
       JOIN solicitudes_practica s ON s.id = ds.solicitud_id
       WHERE s.institucion_id = $1
         AND ds.solicitud_id = ANY($2::uuid[])`,
      [req.tenant.id, rows.map((row) => row.id)]
    );
    const porSolicitud = new Map();
    for (const documento of documentos.rows) {
      const clave = documento.solicitud_id;
      if (!porSolicitud.has(clave)) porSolicitud.set(clave, []);
      porSolicitud.get(clave).push(documento);
    }

    res.json(rows.map((row) => ({
      ...row,
      documentos: porSolicitud.get(row.id) || [],
    })));
  } catch (err) {
    next(err);
  }
}

async function listarDisponibilidadDocentes(req, res, next) {
  try {
    const { rows } = await query(
      `SELECT d.id, d.nombre_completo,
              COUNT(a.id) FILTER (
                WHERE a.estado IN ('pendiente'::estado_asignacion, 'en_curso'::estado_asignacion)
              )::INTEGER AS estudiantes_activos
       FROM usuarios d
       LEFT JOIN asignaciones_practica a
         ON a.docente_id = d.id
        AND a.institucion_id = d.institucion_id
       WHERE d.institucion_id = $1
         AND d.rol = 'docente_asesor'
         AND d.activo = TRUE
       GROUP BY d.id, d.nombre_completo
       ORDER BY estudiantes_activos ASC, d.nombre_completo ASC`,
      [req.tenant.id]
    );

    res.json(rows.map((row) => ({
      ...row,
      disponible: row.estudiantes_activos < 20,
      capacidad_disponible: Math.max(20 - row.estudiantes_activos, 0),
    })));
  } catch (err) {
    next(err);
  }
}

async function descargarDocumentoSolicitud(req, res, next) {
  try {
    const tiposValidos = new Set(['cedula', 'reciboSemestre', 'certificacionMaterias']);
    if (!tiposValidos.has(req.params.tipo)) {
      return responderError(res, 400, 'Tipo de documento no válido.');
    }

    const { rows } = await query(
      `SELECT d.nombre_archivo, d.tipo_mime, d.contenido
       FROM documentos_solicitud_practica d
       JOIN solicitudes_practica s ON s.id = d.solicitud_id
       WHERE s.institucion_id = $1
         AND s.id = $2
         AND d.tipo_documento = $3`,
      [req.tenant.id, req.params.id, req.params.tipo]
    );
    if (rows.length === 0) {
      return responderError(res, 404, 'Documento no encontrado.');
    }

    const documento = rows[0];
    res.set({
      'Content-Type': documento.tipo_mime,
      'Content-Disposition': `attachment; filename*=UTF-8''${encodeURIComponent(documento.nombre_archivo)}`,
      'X-Content-Type-Options': 'nosniff',
    });
    res.send(documento.contenido);
  } catch (err) {
    next(err);
  }
}

async function aprobarSolicitudPractica(req, res, next) {
  const client = await postgres.pool.connect();
  try {
    await client.query('BEGIN');
    await client.query('SELECT pg_advisory_xact_lock(hashtext($1))', [req.tenant.id]);

    const solicitudResult = await client.query(
      `SELECT * FROM solicitudes_practica
       WHERE institucion_id = $1 AND id = $2
       FOR UPDATE`,
      [req.tenant.id, req.params.id]
    );
    if (solicitudResult.rows.length === 0) {
      await client.query('ROLLBACK');
      return responderError(res, 404, 'Solicitud no encontrada en esta institución.');
    }

    const solicitud = solicitudResult.rows[0];
    if (solicitud.estado !== 'pendiente') {
      await client.query('ROLLBACK');
      return responderError(res, 409, 'La solicitud ya fue resuelta.');
    }
    if (req.body.documentosVerificados !== true) {
      await client.query('ROLLBACK');
      return responderError(res, 400, 'Debes validar que todos los documentos son correctos antes de aprobar.');
    }

    const documentos = await client.query(
      `SELECT tipo_documento
       FROM documentos_solicitud_practica
       WHERE solicitud_id = $1`,
      [solicitud.id]
    );
    const tipos = new Set(documentos.rows.map((documento) => documento.tipo_documento));
    if (!['cedula', 'reciboSemestre', 'certificacionMaterias'].every((tipo) => tipos.has(tipo))) {
      await client.query('ROLLBACK');
      return responderError(res, 400, 'La solicitud no tiene completos los documentos obligatorios.');
    }

    let docenteId = req.body.docenteId || null;
    if (docenteId) {
      const docente = await client.query(
        `SELECT d.id,
                (SELECT COUNT(*)
                 FROM asignaciones_practica a
                 WHERE a.institucion_id = d.institucion_id
                   AND a.docente_id = d.id
                   AND a.estado IN ('pendiente'::estado_asignacion, 'en_curso'::estado_asignacion)
                )::INTEGER AS estudiantes_activos
         FROM usuarios d
         WHERE d.institucion_id = $1 AND d.id = $2
           AND d.rol = 'docente_asesor' AND d.activo = TRUE`,
        [req.tenant.id, docenteId]
      );
      if (docente.rows.length === 0) {
        await client.query('ROLLBACK');
        return responderError(res, 400, 'El docente seleccionado no es válido.');
      }
      if (docente.rows[0].estudiantes_activos >= 20) {
        await client.query('ROLLBACK');
        return responderError(res, 409, 'El docente seleccionado alcanzó el máximo de 20 estudiantes.');
      }
    } else {
      const disponibles = await client.query(
        `SELECT d.id,
                COUNT(a.id) FILTER (
                  WHERE a.estado IN ('pendiente'::estado_asignacion, 'en_curso'::estado_asignacion)
                )::INTEGER AS estudiantes_activos
         FROM usuarios d
         LEFT JOIN asignaciones_practica a
           ON a.docente_id = d.id
          AND a.institucion_id = d.institucion_id
         WHERE d.institucion_id = $1
           AND d.rol = 'docente_asesor'
           AND d.activo = TRUE
           GROUP BY d.id, d.nombre_completo
         HAVING COUNT(a.id) FILTER (
                  WHERE a.estado IN ('pendiente'::estado_asignacion, 'en_curso'::estado_asignacion)
                ) < 20
         ORDER BY estudiantes_activos ASC, d.nombre_completo ASC
         LIMIT 1`,
        [req.tenant.id]
      );
      if (disponibles.rows.length === 0) {
        await client.query('ROLLBACK');
        return responderError(res, 409, 'No hay docentes disponibles; cada docente tiene 20 estudiantes activos.');
      }
      docenteId = disponibles.rows[0].id;
    }

    const asignacion = await client.query(
      `INSERT INTO asignaciones_practica
        (institucion_id, estudiante_id, docente_id, institucion_receptora_id,
         fecha_inicio, fecha_fin, horas_requeridas, estado)
       VALUES ($1,$2,$3,$4,$5,$6,$7,'pendiente'::estado_asignacion)
       RETURNING *`,
      [req.tenant.id, solicitud.estudiante_id, docenteId,
       solicitud.institucion_receptora_id, solicitud.fecha_inicio,
       solicitud.fecha_fin, solicitud.horas_requeridas]
    );

    await client.query(
      `UPDATE solicitudes_practica
       SET estado = 'aprobada'::estado_solicitud_practica,
           asignacion_id = $2,
           documentos_verificados = TRUE,
           observacion_validacion = $4,
           motivo_rechazo = NULL,
           resuelto_en = now()
       WHERE institucion_id = $1 AND id = $3`,
      [req.tenant.id, asignacion.rows[0].id, solicitud.id,
       String(req.body.observacionValidacion || '').trim() || null]
    );
    await client.query(
      `UPDATE documentos_solicitud_practica
       SET verificado = TRUE
       WHERE solicitud_id = $1`,
      [solicitud.id]
    );

    await client.query('COMMIT');
    res.status(201).json({
      solicitudId: solicitud.id,
      asignacion: asignacion.rows[0],
    });
  } catch (err) {
    await client.query('ROLLBACK').catch(() => {});
    next(err);
  } finally {
    client.release();
  }
}

async function rechazarSolicitudPractica(req, res, next) {
  try {
    const motivo = String(req.body.motivo || '').trim() || null;
    const { rows } = await query(
      `UPDATE solicitudes_practica
       SET estado = 'rechazada'::estado_solicitud_practica,
           motivo_rechazo = $3,
           resuelto_en = now()
       WHERE institucion_id = $1
         AND id = $2
         AND estado = 'pendiente'::estado_solicitud_practica
       RETURNING *`,
      [req.tenant.id, req.params.id, motivo]
    );

    if (rows.length === 0) {
      return responderError(res, 404, 'Solicitud pendiente no encontrada en esta institución.');
    }
    res.json(rows[0]);
  } catch (err) {
    next(err);
  }
}

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

    if (!estudianteId || !docenteId || !fechaInicio) {
      return responderError(res, 400, 'Estudiante, docente y fecha de inicio son obligatorios.');
    }

    const docente = await query(
      `SELECT d.id,
              COUNT(a.id) FILTER (
                WHERE a.estado IN ('pendiente'::estado_asignacion, 'en_curso'::estado_asignacion)
              )::INTEGER AS estudiantes_activos
       FROM usuarios d
       LEFT JOIN asignaciones_practica a
         ON a.docente_id = d.id
        AND a.institucion_id = d.institucion_id
       WHERE d.institucion_id = $1
         AND d.id = $2
         AND d.rol = 'docente_asesor'
         AND d.activo = TRUE
       GROUP BY d.id`,
      [req.tenant.id, docenteId]
    );
    if (docente.rows.length === 0) {
      return responderError(res, 400, 'El docente seleccionado no es válido.');
    }
    if (docente.rows[0].estudiantes_activos >= 20) {
      return responderError(res, 409, 'El docente seleccionado alcanzó el máximo de 20 estudiantes.');
    }

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

module.exports = {
  listarInstitucionesReceptoras,
  crearInstitucionReceptora,
  listarUsuariosPorRol,
  crearSolicitudPractica,
  listarSolicitudesPractica,
  listarDisponibilidadDocentes,
  descargarDocumentoSolicitud,
  aprobarSolicitudPractica,
  rechazarSolicitudPractica,
  listarAsignaciones,
  crearAsignacion,
  actualizarHorasAsignacion,
  crearEvaluacion,
  listarEvaluaciones,
};
