const fs = require('fs');
const path = require('path');

function getPostgresSslConfig() {
  if (process.env.PG_SSL !== 'true') {
    return undefined;
  }

  const certificatePath = process.env.PG_SSL_ROOT_CERT;
  if (!certificatePath) {
    throw new Error('Configura PG_SSL_ROOT_CERT con la ruta del certificado raíz de PostgreSQL.');
  }

  const resolvedPath = path.isAbsolute(certificatePath)
    ? certificatePath
    : path.resolve(__dirname, '..', '..', certificatePath);

  return {
    ca: fs.readFileSync(resolvedPath, 'utf8'),
    rejectUnauthorized: true,
  };
}

module.exports = { getPostgresSslConfig };
