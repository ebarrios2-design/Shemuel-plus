const express = require('express');
const router = express.Router();

// GET /api/public/institucion
// Info visible ANTES de iniciar sesion: nombre, color, logo.
// Es lo que consume la landing page para "vestirse" con la identidad
// visual de cada universidad segun el subdominio.
router.get('/institucion', (req, res) => {
  const { id, nombre, subdominio, color_primario, logo_url } = req.tenant;
  res.json({ id, nombre, subdominio, colorPrimario: color_primario, logoUrl: logo_url });
});

module.exports = router;
