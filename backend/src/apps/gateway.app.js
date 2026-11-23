const express = require('express');
const cors = require('cors');
const morgan = require('morgan');
const http = require('http');
const https = require('https');

function proxyTo(baseUrl) {
  return (req, res) => {
    const destination = new URL(req.originalUrl, baseUrl);
    const headers = {
      ...req.headers,
      host: req.headers.host || destination.host,
      'x-forwarded-host': req.headers['x-forwarded-host'] || req.headers.host || destination.host,
    };
    const transport = destination.protocol === 'https:' ? https : http;
    const proxyRequest = transport.request(destination, {
      method: req.method,
      headers,
    }, (proxyResponse) => {
      res.writeHead(proxyResponse.statusCode || 502, proxyResponse.headers);
      proxyResponse.pipe(res);
    });

    proxyRequest.on('error', (err) => {
      console.error('[gateway] Error de proxy:', err.message);
      if (!res.headersSent) {
        res.status(502).json({ error: 'El servicio solicitado no está disponible.' });
      } else {
        res.destroy(err);
      }
    });
    req.pipe(proxyRequest);
  };
}

function coincidePrefijo(pathname, prefix) {
  return pathname === prefix || pathname.startsWith(`${prefix}/`);
}

function crearGateway({ saciUrl, ssreUrl } = {}) {
  const app = express();
  const saci = saciUrl || process.env.SACI_URL || 'http://127.0.0.1:4001';
  const ssre = ssreUrl || process.env.SSRE_URL || 'http://127.0.0.1:4002';

  app.use(cors());
  app.use(morgan('dev'));
  app.get('/health', (_req, res) => res.json({ status: 'ok', service: 'gateway' }));
  app.use((req, res, next) => {
    const pathname = new URL(req.originalUrl, 'http://gateway.local').pathname;
    const ssrePrefixes = [
      '/api/practicas/planes-clase',
      '/api/practicas/observaciones',
      '/api/practicas/talleres',
    ];
    const saciPrefixes = [
      '/api/public',
      '/api/auth',
      '/api/roles',
      '/api/usuarios',
      '/api/reportes',
      '/api/practicas/instituciones-receptoras',
      '/api/practicas/usuarios',
      '/api/practicas/solicitudes',
      '/api/practicas/docentes-disponibilidad',
      '/api/practicas/asignaciones',
    ];

    if (ssrePrefixes.some((prefix) => coincidePrefijo(pathname, prefix))) {
      return proxyTo(ssre)(req, res);
    }
    if (saciPrefixes.some((prefix) => coincidePrefijo(pathname, prefix))) {
      return proxyTo(saci)(req, res);
    }
    return next();
  });
  app.use((_req, res) => res.status(404).json({ error: 'Ruta no encontrada.' }));
  return app;
}

module.exports = crearGateway();
module.exports.crearGateway = crearGateway;
