const express = require('express');
const router = express.Router();
const requireInternalService = require('../middleware/internalServiceAuth');
const ctrl = require('../controllers/ssre-internal.controller');

router.use(requireInternalService);
router.post('/tenant', ctrl.resolverTenant);
router.post('/asignaciones/listar', ctrl.listarAsignaciones);
router.post('/asignaciones/validar', ctrl.validarAsignacion);
router.post('/asignaciones/:id/acreditar-horas', ctrl.acreditarHoras);

module.exports = router;
