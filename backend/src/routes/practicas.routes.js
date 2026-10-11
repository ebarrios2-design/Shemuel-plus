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
const ctrl = require('../controllers/practicas.controller');

router.use(requireAuth);

// Instituciones receptoras (Postgres)
router.get('/instituciones-receptoras', ctrl.listarInstitucionesReceptoras);
router.post('/instituciones-receptoras', requireRole('director'), ctrl.crearInstitucionReceptora);

// Usuarios por rol para crear asignaciones (Postgres)
router.get('/usuarios/:rol', requireRole('director', 'docente_asesor'), ctrl.listarUsuariosPorRol);

// Asignaciones (Postgres)
router.get('/asignaciones', ctrl.listarAsignaciones);
router.post('/asignaciones', requireRole('director', 'docente_asesor'), ctrl.crearAsignacion);
router.post('/asignaciones/:id/horas', requireRole('estudiante', 'director'), ctrl.actualizarHorasAsignacion);
router.post('/asignaciones/:id/evaluaciones', requireRole('docente_asesor', 'director'), ctrl.crearEvaluacion);
router.get('/asignaciones/evaluaciones', requireRole('director', 'docente_asesor'), ctrl.listarEvaluaciones);

// Planes de clase (Mongo)
router.get('/planes-clase', ctrl.listarPlanesClase);
router.post('/planes-clase', requireRole('estudiante'), ctrl.crearPlanClase);

// Observaciones pedagogicas (Mongo)
router.get('/observaciones', ctrl.listarObservaciones);
router.post('/observaciones', requireRole('docente_asesor'), ctrl.crearObservacion);

module.exports = router;
