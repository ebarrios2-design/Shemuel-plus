/**
 * Rutas del modulo de practicas.
 *
 * Aqui se agrupan todas las operaciones relacionadas con la gestion de
 * asignaciones, planes de clase y observaciones pedagogicas.
 *
 * Este modulo conecta dos fuentes de datos:
 * - PostgreSQL para las asignaciones y relaciones institucionales
 * - MongoDB para planes y observaciones con estructura variable
 */
const express = require('express');
const router = express.Router();
const { requireAuth, requireRole } = require('../middleware/auth');
const requireMongo = require('../middleware/requireMongo');
const recibirActividad = require('../middleware/actividadUpload');
const recibirSolicitud = require('../middleware/solicitudUpload');
const ctrl = require('../controllers/practicas.controller');

router.use(requireAuth);

// Instituciones receptoras (Postgres)
router.get('/instituciones-receptoras', ctrl.listarInstitucionesReceptoras);
router.post('/instituciones-receptoras', requireRole('director'), ctrl.crearInstitucionReceptora);

// Usuarios por rol para crear asignaciones (Postgres)
router.get('/usuarios/:rol', requireRole('director', 'docente_asesor'), ctrl.listarUsuariosPorRol);

// Solicitudes de práctica
router.post('/solicitudes', requireRole('estudiante'), recibirSolicitud, ctrl.crearSolicitudPractica);
router.get('/solicitudes', ctrl.listarSolicitudesPractica);
router.get('/solicitudes/:id/documentos/:tipo', requireRole('director'), ctrl.descargarDocumentoSolicitud);
router.get('/docentes-disponibilidad', requireRole('director'), ctrl.listarDisponibilidadDocentes);
router.post('/solicitudes/:id/aprobar', requireRole('director'), ctrl.aprobarSolicitudPractica);
router.post('/solicitudes/:id/rechazar', requireRole('director'), ctrl.rechazarSolicitudPractica);

// Asignaciones (Postgres)
router.get('/asignaciones', ctrl.listarAsignaciones);
router.post('/asignaciones', requireRole('director', 'docente_asesor'), ctrl.crearAsignacion);
router.post('/asignaciones/:id/horas', requireRole('director'), ctrl.actualizarHorasAsignacion);
router.post('/asignaciones/:id/evaluaciones', requireRole('docente_asesor', 'director'), ctrl.crearEvaluacion);
router.get('/asignaciones/evaluaciones', requireRole('director', 'docente_asesor'), ctrl.listarEvaluaciones);

// Planes de clase (Mongo)
router.get('/planes-clase', requireMongo, ctrl.listarPlanesClase);
router.post('/planes-clase', requireRole('estudiante'), requireMongo, ctrl.crearPlanClase);

// Observaciones pedagogicas (Mongo)
router.get('/observaciones', requireMongo, ctrl.listarObservaciones);
router.post('/observaciones', requireRole('docente_asesor'), requireMongo, ctrl.crearObservacion);

// Talleres, entrega de actividades y quizzes (Mongo + horas en PostgreSQL)
router.get('/talleres', requireRole('estudiante', 'docente_asesor'), requireMongo, ctrl.listarTalleres);
router.post('/talleres', requireRole('docente_asesor'), requireMongo, ctrl.crearTaller);
router.post('/talleres/:id/quiz/activar', requireRole('docente_asesor'), requireMongo, ctrl.activarQuiz);
router.post('/talleres/:id/actividad/iniciar', requireRole('estudiante'), requireMongo, ctrl.iniciarActividad);
router.post('/talleres/:id/actividad/entregar', requireRole('estudiante'), requireMongo, recibirActividad, ctrl.entregarActividad);
router.get('/talleres/:id/entrega/archivo', requireRole('estudiante', 'docente_asesor'), requireMongo, ctrl.descargarActividad);
router.post('/talleres/:id/quiz/iniciar', requireRole('estudiante'), requireMongo, ctrl.iniciarQuiz);
router.post('/talleres/:id/quiz/respuestas', requireRole('estudiante'), requireMongo, ctrl.guardarRespuestasQuiz);
router.post('/talleres/:id/quiz/finalizar', requireRole('estudiante'), requireMongo, ctrl.finalizarQuiz);

module.exports = router;
