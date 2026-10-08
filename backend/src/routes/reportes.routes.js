const express = require('express');
const router = express.Router();
const { requireAuth, requireRole } = require('../middleware/auth');
const { resumenIndicadores } = require('../controllers/reportes.controller');

router.use(requireAuth);

// Solo el Director necesita los indicadores agregados de acreditacion
router.get('/resumen', requireRole('director'), resumenIndicadores);

module.exports = router;
