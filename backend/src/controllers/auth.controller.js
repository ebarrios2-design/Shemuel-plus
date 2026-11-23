/**
 * Controlador de autenticacion.
 *
 * Se conecta con PostgreSQL para validar credenciales de un usuario dentro de
 * la institucion actual. Si todo sale bien, emite un JWT que luego se usa
 * para autorizar llamadas a rutas protegidas.
 */
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const postgres = require('../config/postgres');
const query = (...args) => postgres.query(...args);

function normalizarEmail(email) {
  return typeof email === 'string' ? email.trim().toLowerCase() : '';
}

function emailValido(email) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}

function crearToken(usuario, institucionId, requiereCambioPassword) {
  return jwt.sign(
    {
      sub: usuario.id,
      institucionId,
      rol: usuario.rol,
      email: usuario.email,
      requiereCambioPassword,
    },
    process.env.JWT_SECRET,
    { expiresIn: process.env.JWT_EXPIRES_IN || '8h' }
  );
}

async function verificarCorreo(req, res, next) {
  try {
    const email = normalizarEmail(req.body.email);
    if (!emailValido(email)) {
      return res.status(400).json({ error: 'Ingresa un correo electrónico válido.' });
    }

    const { rows } = await query(
      `SELECT 1
       FROM usuarios
       WHERE institucion_id = $1 AND email = $2 AND activo = TRUE
       LIMIT 1`,
      [req.tenant.id, email]
    );

    if (rows.length === 0) {
      return res.status(404).json({ error: 'No encontramos una cuenta activa con ese correo en esta institución.' });
    }

    res.json({ email });
  } catch (err) {
    next(err);
  }
}

// El login SIEMPRE filtra por institucion_id (req.tenant.id), asi el
// mismo correo puede existir en dos universidades distintas sin chocar,
// y un usuario de la UDI nunca podria autenticarse contra el tenant de
// otra institucion aunque adivinara la contraseña.
async function login(req, res, next) {
  try {
    const email = normalizarEmail(req.body.email);
    const { password } = req.body;
    if (!emailValido(email) || !password) {
      return res.status(400).json({ error: 'Correo electrónico y contraseña válidos son obligatorios.' });
    }

    const { rows } = await query(
      `SELECT id, nombre_completo, email, password_hash, rol, requiere_cambio_password
       FROM usuarios
       WHERE institucion_id = $1 AND email = $2 AND activo = TRUE`,
      [req.tenant.id, email]
    );

    if (rows.length === 0) {
      return res.status(401).json({ error: 'Credenciales invalidas.' });
    }

    const usuario = rows[0];
    const requiereCambioPassword = Boolean(usuario.requiere_cambio_password);
    const passwordOk = await bcrypt.compare(password, usuario.password_hash);
    if (!passwordOk) {
      return res.status(401).json({ error: 'Credenciales invalidas.' });
    }

    const token = crearToken(usuario, req.tenant.id, requiereCambioPassword);

    res.json({
      token,
      usuario: {
        id: usuario.id,
        nombre: usuario.nombre_completo,
        email: usuario.email,
        rol: usuario.rol,
      },
      requiereCambioPassword,
      institucion: req.tenant,
    });
  } catch (err) {
    next(err);
  }
}

async function cambiarPassword(req, res, next) {
  try {
    const { passwordActual, passwordNueva } = req.body;
    if (typeof passwordActual !== 'string' || typeof passwordNueva !== 'string') {
      return res.status(400).json({ error: 'La contraseña actual y la nueva son obligatorias.' });
    }

    if (passwordNueva.length < 10) {
      return res.status(400).json({ error: 'La nueva contraseña debe tener al menos 10 caracteres.' });
    }

    const { rows } = await query(
      `SELECT id, nombre_completo, email, password_hash, rol
       FROM usuarios
       WHERE institucion_id = $1 AND id = $2 AND activo = TRUE`,
      [req.tenant.id, req.user.sub]
    );

    if (rows.length === 0) {
      return res.status(404).json({ error: 'La cuenta ya no está disponible en esta institución.' });
    }

    const usuario = rows[0];
    const passwordActualValida = await bcrypt.compare(passwordActual, usuario.password_hash);
    if (!passwordActualValida) {
      return res.status(401).json({ error: 'La contraseña actual no es correcta.' });
    }

    if (await bcrypt.compare(passwordNueva, usuario.password_hash)) {
      return res.status(400).json({ error: 'La nueva contraseña debe ser diferente a la actual.' });
    }

    const passwordHash = await bcrypt.hash(passwordNueva, 10);
    const actualizado = await query(
      `UPDATE usuarios
       SET password_hash = $3, requiere_cambio_password = FALSE
       WHERE institucion_id = $1 AND id = $2 AND activo = TRUE
       RETURNING id, nombre_completo, email, rol`,
      [req.tenant.id, usuario.id, passwordHash]
    );

    if (actualizado.rows.length === 0) {
      return res.status(404).json({ error: 'La cuenta ya no está disponible en esta institución.' });
    }

    const usuarioActualizado = actualizado.rows[0];
    res.json({
      token: crearToken(usuarioActualizado, req.tenant.id, false),
      usuario: {
        id: usuarioActualizado.id,
        nombre: usuarioActualizado.nombre_completo,
        email: usuarioActualizado.email,
        rol: usuarioActualizado.rol,
      },
      requiereCambioPassword: false,
    });
  } catch (err) {
    next(err);
  }
}

module.exports = { verificarCorreo, login, cambiarPassword };
