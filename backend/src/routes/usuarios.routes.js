const express = require('express');
const router = express.Router();
const { requireAuth, requireRole } = require('../middleware/auth');
const requireUserManager = requireRole('director', 'institucion_receptora');
const {
  listarRoles,
  listarUsuarios,
  listarUsuariosPorRol,
  crearUsuario,
  actualizarUsuario,
  eliminarUsuario,
} = require('../controllers/usuarios.controller');

router.use(requireAuth);

router.get('/roles', requireUserManager, listarRoles);
router.get('/roles/:rol/usuarios', requireUserManager, listarUsuariosPorRol);
router.get('/usuarios', requireUserManager, listarUsuarios);
router.post('/usuarios', requireUserManager, crearUsuario);
router.put('/usuarios/:id', requireUserManager, actualizarUsuario);
router.delete('/usuarios/:id', requireUserManager, eliminarUsuario);

module.exports = router;
