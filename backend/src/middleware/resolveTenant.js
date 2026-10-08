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

    let subdominio = null;

    if (host.endsWith(`.${baseDomain}`)) {
      subdominio = host.replace(`.${baseDomain}`, '');
    } else if (host.includes('.localhost')) {
      subdominio = host.split('.localhost')[0];
    } else {
      // Fallback para pruebas: header o query param explicito
      subdominio = req.headers['x-tenant'] || req.query.tenant || null;
    }

    if (!subdominio) {
      return res.status(400).json({
        error: 'No se pudo determinar la institucion (subdominio) de la peticion.',
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
