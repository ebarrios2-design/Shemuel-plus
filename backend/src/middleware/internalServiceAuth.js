const crypto = require('crypto');

function requireInternalService(req, res, next) {
  const expected = process.env.SACI_INTERNAL_TOKEN || '';
  const provided = req.get('x-internal-service-token') || '';
  const expectedBuffer = Buffer.from(expected);
  const providedBuffer = Buffer.from(provided);

  if (!expected || expectedBuffer.length !== providedBuffer.length
    || !crypto.timingSafeEqual(expectedBuffer, providedBuffer)) {
    return res.status(403).json({ error: 'Servicio interno no autorizado.' });
  }

  next();
}

module.exports = requireInternalService;
