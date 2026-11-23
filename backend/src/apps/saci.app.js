const express = require('express');
const cors = require('cors');
const morgan = require('morgan');
const resolveTenant = require('../middleware/resolveTenant');
const errorHandler = require('../middleware/errorHandler');
const publicRoutes = require('../routes/public.routes');
const authRoutes = require('../routes/auth.routes');
const usuariosRoutes = require('../routes/usuarios.routes');
const practicasRoutes = require('../routes/practicas-saci.routes');
const reportesRoutes = require('../routes/reportes.routes');
const internalSsreRoutes = require('../routes/ssre-internal.routes');

const app = express();
app.use(cors());
app.use(express.json());
app.use(morgan('dev'));

app.get('/health', (_req, res) => res.json({ status: 'ok', service: 'SACI' }));
app.use('/internal/ssre', internalSsreRoutes);
app.use('/api/public', resolveTenant, publicRoutes);
app.use('/api/auth', resolveTenant, authRoutes);
app.use('/api', resolveTenant, usuariosRoutes);
app.use('/api/practicas', resolveTenant, practicasRoutes);
app.use('/api/reportes', resolveTenant, reportesRoutes);
app.use((_req, res) => res.status(404).json({ error: 'Ruta no encontrada.' }));
app.use(errorHandler);

module.exports = app;
