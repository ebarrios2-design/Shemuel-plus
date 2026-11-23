const express = require('express');
const router = express.Router();
const { requireAuth, requireRole } = require('../middleware/auth');
const recibirSolicitud = require('../middleware/solicitudUpload');
const ctrl = require('../controllers/practicas.controller');

router.use(requireAuth);

router.get('/instituciones-receptoras', ctrl.listarInstitucionesReceptoras);
router.post('/instituciones-receptoras', requireRole('director'), ctrl.crearInstitucionReceptora);
router.get('/usuarios/:rol', requireRole('director', 'docente_asesor'), ctrl.listarUsuariosPorRol);

router.post('/solicitudes', requireRole('estudiante'), recibirSolicitud, ctrl.crearSolicitudPractica);
router.get('/solicitudes', ctrl.listarSolicitudesPractica);
router.get('/solicitudes/:id/documentos/:tipo', requireRole('director'), ctrl.descargarDocumentoSolicitud);
router.get('/docentes-disponibilidad', requireRole('director'), ctrl.listarDisponibilidadDocentes);
router.post('/solicitudes/:id/aprobar', requireRole('director'), ctrl.aprobarSolicitudPractica);
router.post('/solicitudes/:id/rechazar', requireRole('director'), ctrl.rechazarSolicitudPractica);

router.get('/asignaciones', ctrl.listarAsignaciones);
router.post('/asignaciones', requireRole('director', 'docente_asesor'), ctrl.crearAsignacion);
router.post('/asignaciones/:id/horas', requireRole('director'), ctrl.actualizarHorasAsignacion);
router.post('/asignaciones/:id/evaluaciones', requireRole('docente_asesor', 'director'), ctrl.crearEvaluacion);
router.get('/asignaciones/evaluaciones', requireRole('director', 'docente_asesor'), ctrl.listarEvaluaciones);

module.exports = router;
