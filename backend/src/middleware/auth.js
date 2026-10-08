const jwt = require('jsonwebtoken');

// Verifica el JWT y confirma que el token pertenece a la MISMA
// institucion que se resolvio por subdominio (req.tenant). Esto evita
// que un token emitido para udi.shemuel.app se pueda usar en uan.shemuel.app.
function requireAuth(req, res, next) {
  const header = req.headers.authorization || '';
  const token = header.startsWith('Bearer ') ? header.slice(7) : null;

  if (!token) {
    return res.status(401).json({ error: 'Token no proporcionado.' });
  }

  try {
    const payload = jwt.verify(token, process.env.JWT_SECRET);

    if (req.tenant && payload.institucionId !== req.tenant.id) {
      return res.status(403).json({ error: 'El token no corresponde a esta institucion.' });
    }

    req.user = payload; // { sub, institucionId, rol, email }
    next();
  } catch (err) {
    return res.status(401).json({ error: 'Token invalido o expirado.' });
  }
}

// Restringe el acceso a un subconjunto de roles.
// Uso: requireRole('director', 'docente_asesor')
function requireRole(...rolesPermitidos) {
  return (req, res, next) => {
    if (!req.user || !rolesPermitidos.includes(req.user.rol)) {
      return res.status(403).json({ error: 'No tienes permisos para esta accion.' });
    }
    next();
  };
}

module.exports = { requireAuth, requireRole };
