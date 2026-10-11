const express = require('express');
const router = express.Router();
const { requireAuth, requireRole } = require('../middleware/auth');
const {
  listarRoles,
  listarUsuarios,
  listarUsuariosPorRol,
  crearUsuario,
  actualizarUsuario,
  eliminarUsuario,
} = require('../controllers/usuarios.controller');

router.use(requireAuth);

router.get('/roles', listarRoles);
router.get('/roles/:rol/usuarios', listarUsuariosPorRol);
router.get('/usuarios', listarUsuarios);
router.post('/usuarios', requireRole('director'), crearUsuario);
router.put('/usuarios/:id', requireRole('director'), actualizarUsuario);
router.delete('/usuarios/:id', requireRole('director'), eliminarUsuario);

module.exports = router;
