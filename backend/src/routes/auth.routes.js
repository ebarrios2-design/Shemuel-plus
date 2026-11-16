/**
 * Rutas de autenticacion.
 *
 * Se conectan con el controlador de login para validar credenciales y
 * devolver un JWT asociado al tenant actual.
 */
const express = require('express');
const router = express.Router();
const { verificarCorreo, login } = require('../controllers/auth.controller');

// Ambas rutas requieren que resolveTenant haya identificado el tenant.
router.post('/verificar-correo', verificarCorreo);
router.post('/login', login);

module.exports = router;
