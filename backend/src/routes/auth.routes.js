/**
 * Rutas de autenticacion.
 *
 * Se conectan con el controlador de login para validar credenciales y
 * devolver un JWT asociado al tenant actual.
 */
const express = require('express');
const router = express.Router();
const { verificarCorreo, login, cambiarPassword } = require('../controllers/auth.controller');
const { requireAuth } = require('../middleware/auth');

// Estas rutas requieren que resolveTenant haya identificado el tenant.
router.post('/verificar-correo', verificarCorreo);
router.post('/login', login);
router.post('/cambiar-password', requireAuth, cambiarPassword);

module.exports = router;
