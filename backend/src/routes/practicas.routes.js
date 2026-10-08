const express = require('express');
const router = express.Router();
const { requireAuth, requireRole } = require('../middleware/auth');
const ctrl = require('../controllers/practicas.controller');

router.use(requireAuth);

// Asignaciones (Postgres)
router.get('/asignaciones', ctrl.listarAsignaciones);
router.post('/asignaciones', requireRole('director', 'docente_asesor'), ctrl.crearAsignacion);

// Planes de clase (Mongo)
router.get('/planes-clase', ctrl.listarPlanesClase);
router.post('/planes-clase', requireRole('estudiante'), ctrl.crearPlanClase);

// Observaciones pedagogicas (Mongo)
router.get('/observaciones', ctrl.listarObservaciones);
router.post('/observaciones', requireRole('docente_asesor'), ctrl.crearObservacion);

module.exports = router;
