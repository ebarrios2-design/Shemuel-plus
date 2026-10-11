/**
 * Controlador de autenticacion.
 *
 * Se conecta con PostgreSQL para validar credenciales de un usuario dentro de
 * la institucion actual. Si todo sale bien, emite un JWT que luego se usa
 * para autorizar llamadas a rutas protegidas.
 */
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const { query } = require('../config/postgres');

// El login SIEMPRE filtra por institucion_id (req.tenant.id), asi el
// mismo correo puede existir en dos universidades distintas sin chocar,
// y un usuario de la UDI nunca podria autenticarse contra el tenant de
// otra institucion aunque adivinara la contraseña.
async function login(req, res, next) {
  try {
    const { email, password } = req.body;
    if (!email || !password) {
      return res.status(400).json({ error: 'email y password son obligatorios.' });
    }

    const { rows } = await query(
      `SELECT id, nombre_completo, email, password_hash, rol
       FROM usuarios
       WHERE institucion_id = $1 AND email = $2 AND activo = TRUE`,
      [req.tenant.id, email]
    );

    if (rows.length === 0) {
      return res.status(401).json({ error: 'Credenciales invalidas.' });
    }

    const usuario = rows[0];
    const passwordOk = await bcrypt.compare(password, usuario.password_hash);
    if (!passwordOk) {
      return res.status(401).json({ error: 'Credenciales invalidas.' });
    }

    const token = jwt.sign(
      {
        sub: usuario.id,
        institucionId: req.tenant.id,
        rol: usuario.rol,
        email: usuario.email,
      },
      process.env.JWT_SECRET,
      { expiresIn: process.env.JWT_EXPIRES_IN || '8h' }
    );

    res.json({
      token,
      usuario: {
        id: usuario.id,
        nombre: usuario.nombre_completo,
        email: usuario.email,
        rol: usuario.rol,
      },
      institucion: req.tenant,
    });
  } catch (err) {
    next(err);
  }
}

module.exports = { login };
