const { query } = require('../config/postgres');

// Indicadores clave para el Director del programa: SIEMPRE segmentados
// por institucion_id, nunca se mezclan datos de otra universidad.
async function resumenIndicadores(req, res, next) {
  try {
    const tenantId = req.tenant.id;

    const [totales, porEstado, cumplimientoHoras] = await Promise.all([
      query(
        `SELECT
           COUNT(*) FILTER (WHERE rol = 'estudiante') AS total_estudiantes,
           COUNT(*) FILTER (WHERE rol = 'docente_asesor') AS total_docentes
         FROM usuarios WHERE institucion_id = $1`,
        [tenantId]
      ),
      query(
        `SELECT estado, COUNT(*) AS cantidad
         FROM asignaciones_practica
         WHERE institucion_id = $1
         GROUP BY estado`,
        [tenantId]
      ),
      query(
        `SELECT
           ROUND(AVG(horas_cumplidas::decimal / NULLIF(horas_requeridas, 0)) * 100, 1) AS porcentaje_promedio
         FROM asignaciones_practica
         WHERE institucion_id = $1 AND horas_requeridas > 0`,
        [tenantId]
      ),
    ]);

    res.json({
      institucion: req.tenant.nombre,
      ...totales.rows[0],
      asignacionesPorEstado: porEstado.rows,
      porcentajePromedioHorasCumplidas: cumplimientoHoras.rows[0].porcentaje_promedio || 0,
    });
  } catch (err) {
    next(err);
  }
}

module.exports = { resumenIndicadores };
