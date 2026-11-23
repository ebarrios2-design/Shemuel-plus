const postgres = require('../config/postgres');
const query = (...args) => postgres.query(...args);

async function resolverTenant(req, res, next) {
  try {
    const { tenantId, subdominio } = req.body;
    if (!tenantId || !subdominio) {
      return res.status(400).json({ error: 'Tenant y subdominio son obligatorios.' });
    }

    const { rows } = await query(
      `SELECT id, nombre, subdominio, activo
       FROM instituciones
       WHERE id = $1 AND subdominio = $2 AND activo = TRUE`,
      [tenantId, subdominio]
    );
    if (rows.length === 0) {
      return res.status(404).json({ error: 'Institución no encontrada o inactiva.' });
    }
    res.json(rows[0]);
  } catch (err) {
    next(err);
  }
}

async function listarAsignaciones(req, res, next) {
  try {
    const { tenantId, userId, rol } = req.body;
    if (!tenantId || !userId || !['estudiante', 'docente_asesor'].includes(rol)) {
      return res.status(400).json({ error: 'Tenant, usuario y rol válidos son obligatorios.' });
    }

    const columna = rol === 'docente_asesor' ? 'docente_id' : 'estudiante_id';
    const { rows } = await query(
      `SELECT a.id, a.estudiante_id, e.nombre_completo AS estudiante
       FROM asignaciones_practica a
       JOIN usuarios e
         ON e.id = a.estudiante_id
        AND e.institucion_id = a.institucion_id
       WHERE a.institucion_id = $1
         AND a.${columna} = $2
       ORDER BY a.creado_en DESC`,
      [tenantId, userId]
    );
    res.json(rows);
  } catch (err) {
    next(err);
  }
}

async function validarAsignacion(req, res, next) {
  try {
    const { tenantId, userId, rol, asignacionId, estudianteId } = req.body;
    if (!tenantId || !userId || !asignacionId
      || !['estudiante', 'docente_asesor'].includes(rol)) {
      return res.status(400).json({ error: 'Datos de validación incompletos.' });
    }

    const params = [tenantId, asignacionId, userId];
    let filtro = rol === 'docente_asesor' ? 'docente_id = $3' : 'estudiante_id = $3';
    if (rol === 'docente_asesor' && estudianteId) {
      params.push(estudianteId);
      filtro += ' AND estudiante_id = $4';
    }

    const { rows } = await query(
      `SELECT id
       FROM asignaciones_practica
       WHERE institucion_id = $1 AND id = $2 AND ${filtro}
       LIMIT 1`,
      params
    );
    res.json({ autorizado: rows.length > 0 });
  } catch (err) {
    next(err);
  }
}

async function acreditarHoras(req, res, next) {
  let client;
  try {
    const { tenantId, horas, claveIdempotencia } = req.body;
    const { id: asignacionId } = req.params;
    if (!tenantId || ![1, 3].includes(Number(horas))
      || typeof claveIdempotencia !== 'string'
      || !/^[a-zA-Z0-9:_-]{1,120}$/.test(claveIdempotencia)) {
      return res.status(400).json({ error: 'Datos de acreditación no válidos.' });
    }

    client = await postgres.pool.connect();
    await client.query('BEGIN');
    const asignacionResult = await client.query(
      `SELECT id, horas_cumplidas, horas_requeridas, estado
       FROM asignaciones_practica
       WHERE institucion_id = $1 AND id = $2
       FOR UPDATE`,
      [tenantId, asignacionId]
    );
    if (asignacionResult.rows.length === 0) {
      await client.query('ROLLBACK');
      return res.status(404).json({ error: 'Asignación no encontrada.' });
    }

    const insertResult = await client.query(
      `INSERT INTO acreditaciones_horas
        (institucion_id, asignacion_id, clave_idempotencia, horas)
       VALUES ($1, $2, $3, $4)
       ON CONFLICT (institucion_id, clave_idempotencia) DO NOTHING
       RETURNING id`,
      [tenantId, asignacionId, claveIdempotencia, Number(horas)]
    );

    if (insertResult.rows.length === 0) {
      const existente = await client.query(
        `SELECT asignacion_id, horas
         FROM acreditaciones_horas
         WHERE institucion_id = $1 AND clave_idempotencia = $2`,
        [tenantId, claveIdempotencia]
      );
      if (existente.rows[0]?.asignacion_id !== asignacionId
        || Number(existente.rows[0]?.horas) !== Number(horas)) {
        await client.query('ROLLBACK');
        return res.status(409).json({ error: 'La clave de acreditación ya fue usada con otros datos.' });
      }
    } else {
      await client.query(
        `UPDATE asignaciones_practica
         SET horas_cumplidas = LEAST(horas_requeridas, horas_cumplidas + $1),
             estado = CASE
               WHEN LEAST(horas_requeridas, horas_cumplidas + $1) >= horas_requeridas THEN 'finalizada'::estado_asignacion
               ELSE 'en_curso'::estado_asignacion
             END
         WHERE institucion_id = $2 AND id = $3`,
        [Number(horas), tenantId, asignacionId]
      );
    }

    const actualizado = await client.query(
      `SELECT id, horas_cumplidas, horas_requeridas, estado
       FROM asignaciones_practica
       WHERE institucion_id = $1 AND id = $2`,
      [tenantId, asignacionId]
    );
    await client.query('COMMIT');
    res.json({
      asignacion: actualizado.rows[0],
      acreditada: insertResult.rows.length > 0,
    });
  } catch (err) {
    if (client) await client.query('ROLLBACK').catch(() => {});
    next(err);
  } finally {
    if (client) client.release();
  }
}

module.exports = {
  resolverTenant,
  listarAsignaciones,
  validarAsignacion,
  acreditarHoras,
};
