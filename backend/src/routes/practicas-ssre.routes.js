const express = require('express');
const router = express.Router();
const { requireRole } = require('../middleware/auth');
const requireMongo = require('../middleware/requireMongo');
const recibirActividad = require('../middleware/actividadUpload');
const ctrl = require('../controllers/practicas-ssre.controller');

router.get('/planes-clase', requireMongo, ctrl.listarPlanesClase);
router.post('/planes-clase', requireRole('estudiante'), requireMongo, ctrl.crearPlanClase);

router.get('/observaciones', requireMongo, ctrl.listarObservaciones);
router.post('/observaciones', requireRole('docente_asesor'), requireMongo, ctrl.crearObservacion);

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
