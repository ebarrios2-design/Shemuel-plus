/**
 * Controlador de reportes.
 *
 * Centraliza indicadores de gestion para el director del programa. Todos los
 * calculos se hacen por institucion_id para garantizar que cada universidad
 * vea solo su informacion agregada.
 */
const { query } = require('../config/postgres');

// Indicadores clave para el Director del programa: SIEMPRE segmentados
// por institucion_id, nunca se mezclan datos de otra universidad.
async function resumenIndicadores(req, res, next) {
  try {
    const tenantId = req.tenant.id;

    const [totales, porEstado, cumplimientoHoras, topEstudiantes] = await Promise.all([
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
         GROUP BY estado
         ORDER BY estado`,
        [tenantId]
      ),
      query(
        `SELECT
           ROUND(AVG(horas_cumplidas::decimal / NULLIF(horas_requeridas, 0)) * 100, 1) AS porcentaje_promedio
         FROM asignaciones_practica
         WHERE institucion_id = $1 AND horas_requeridas > 0`,
        [tenantId]
      ),
      query(
        `SELECT e.nombre_completo AS estudiante,
                a.horas_cumplidas,
                a.horas_requeridas,
                a.estado,
                ROUND((a.horas_cumplidas::decimal / NULLIF(a.horas_requeridas, 0)) * 100, 1) AS porcentaje_cumplimiento
         FROM asignaciones_practica a
         JOIN usuarios e ON e.id = a.estudiante_id
         WHERE a.institucion_id = $1
         ORDER BY a.horas_cumplidas DESC, e.nombre_completo ASC
         LIMIT 5`,
        [tenantId]
      ),
    ]);

    res.json({
      institucion: req.tenant.nombre,
      ...totales.rows[0],
      totalAsignaciones: porEstado.rows.reduce((sum, row) => sum + Number(row.cantidad || 0), 0),
      asignacionesPorEstado: porEstado.rows,
      porcentajePromedioHorasCumplidas: cumplimientoHoras.rows[0]?.porcentaje_promedio || 0,
      topEstudiantes: topEstudiantes.rows,
    });
  } catch (err) {
    next(err);
  }
}

module.exports = { resumenIndicadores };
