const { requireAuth } = require('./auth');
const saciClient = require('../services/saciClient');

function obtenerSubdominio(req) {
  const host = req.hostname || '';
  const baseDomain = process.env.BASE_DOMAIN || 'shemuel.app';
  if (host.endsWith(`.${baseDomain}`)) {
    return host.slice(0, -baseDomain.length - 1);
  }
  if (process.env.NODE_ENV !== 'production') {
    return req.query.tenant || req.get('x-tenant');
  }
  return req.get('x-tenant') || req.query.tenant;
}

function resolverTenantDesdeSaci(req, res, next) {
  requireAuth(req, res, async () => {
    const subdominio = obtenerSubdominio(req);
    if (typeof subdominio !== 'string'
      || !/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(subdominio)
      || !req.user.institucionId) {
      return res.status(400).json({ error: 'No se pudo determinar un tenant válido.' });
    }

    try {
      req.tenant = await saciClient.resolverTenant(req.user.institucionId, subdominio);
      next();
    } catch (err) {
      next(err);
    }
  });
}

module.exports = resolverTenantDesdeSaci;
