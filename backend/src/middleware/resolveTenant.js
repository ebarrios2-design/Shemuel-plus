const { query } = require('../config/postgres');

/**
 * Detecta a que institucion (tenant) pertenece la peticion.
 *
 * En produccion se lee del subdominio real: udi.shemuel.app -> "udi".
 * En desarrollo local (localhost no tiene subdominios reales de forma
 * practica) se acepta ademas un header "X-Tenant" o un query ?tenant=,
 * para poder simular udi.localhost / uan.localhost sin configurar DNS.
 *
 * El resultado se guarda en req.tenant y de ahi en adelante TODAS las
 * consultas a Postgres y Mongo deben filtrar por req.tenant.id.
 */
async function resolveTenant(req, res, next) {
  try {
    const host = req.hostname || '';
    const baseDomain = process.env.BASE_DOMAIN || 'shemuel.app';
    const tenantHeader = typeof req.headers['x-tenant'] === 'string'
      ? req.headers['x-tenant'].trim().toLowerCase()
      : null;
    const tenantQuery = typeof req.query.tenant === 'string'
      ? req.query.tenant.trim().toLowerCase()
      : null;

    let subdominio = null;

    if (host.endsWith(`.${baseDomain}`)) {
      subdominio = host.slice(0, -baseDomain.length - 1);
    } else if (process.env.NODE_ENV !== 'production') {
      subdominio = tenantQuery || tenantHeader;
    } else {
      subdominio = tenantHeader || tenantQuery;
    }

    if (!subdominio || !/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(subdominio)) {
      return res.status(400).json({
        error: 'No se pudo determinar un tenant válido.',
      });
    }

    const { rows } = await query(
      'SELECT id, nombre, subdominio, color_primario, logo_url, activo FROM instituciones WHERE subdominio = $1',
      [subdominio]
    );

    if (rows.length === 0 || !rows[0].activo) {
      return res.status(404).json({ error: `Institucion '${subdominio}' no encontrada o inactiva.` });
    }

    req.tenant = rows[0];
    next();
  } catch (err) {
    next(err);
  }
}

module.exports = resolveTenant;
