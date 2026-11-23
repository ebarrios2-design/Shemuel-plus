const express = require('express');
const cors = require('cors');
const morgan = require('morgan');
const resolveTenantFromSaci = require('../middleware/resolveTenantFromSaci');
const errorHandler = require('../middleware/errorHandler');
const practicasRoutes = require('../routes/practicas-ssre.routes');

const app = express();
app.use(cors());
app.use(express.json());
app.use(morgan('dev'));

app.get('/health', (_req, res) => res.json({ status: 'ok', service: 'SSRE' }));
app.use('/api/practicas', resolveTenantFromSaci, practicasRoutes);
app.use((_req, res) => res.status(404).json({ error: 'Ruta no encontrada.' }));
app.use(errorHandler);

module.exports = app;
