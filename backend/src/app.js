/**
 * Aplicacion Express principal de Shemuel Plus.
 *
 * Este archivo monta la API REST y conecta de forma centralizada:
 * - middlewares globales (CORS, JSON, logs)
 * - deteccion de tenant por subdominio
 * - rutas publicas y privadas por modulo funcional
 * - manejo de errores para devolver respuestas consistentes
 *
 * Flujo general:
 * 1) La peticion llega a app.js
 * 2) resolveTenant identifica la institucion (tenant)
 * 3) la ruta correspondiente decide que controller ejecuta la accion
 * 4) cada controller consulta Postgres o Mongo para ese tenant
 */
const express = require('express');
const cors = require('cors');
const morgan = require('morgan');

const resolveTenant = require('./middleware/resolveTenant');
const errorHandler = require('./middleware/errorHandler');

const publicRoutes = require('./routes/public.routes');
const authRoutes = require('./routes/auth.routes');
const usuariosRoutes = require('./routes/usuarios.routes');
const practicasRoutes = require('./routes/practicas.routes');
const reportesRoutes = require('./routes/reportes.routes');

const app = express();

app.use(cors());
app.use(express.json());
app.use(morgan('dev'));

// Chequeo de salud, no depende de ningun tenant.
app.get('/health', (req, res) => res.json({ status: 'ok' }));

// A partir de aqui TODAS las rutas de negocio pasan primero por
// resolveTenant, que decide a que universidad pertenece la peticion.
app.use('/api/public', resolveTenant, publicRoutes);
app.use('/api/auth', resolveTenant, authRoutes);
app.use('/api', resolveTenant, usuariosRoutes);
app.use('/api/practicas', resolveTenant, practicasRoutes);
app.use('/api/reportes', resolveTenant, reportesRoutes);

app.use((req, res) => res.status(404).json({ error: 'Ruta no encontrada.' }));
app.use(errorHandler);

module.exports = app;
