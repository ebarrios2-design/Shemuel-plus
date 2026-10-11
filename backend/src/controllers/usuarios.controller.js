const bcrypt = require('bcryptjs');
const { query } = require('../config/postgres');

const ROLES = ['estudiante', 'docente_asesor', 'institucion_receptora', 'director'];

function validarRol(rol) {
  return ROLES.includes(rol) ? rol : null;
}

async function listarRoles(req, res, next) {
  try {
    const { rows } = await query('SELECT unnest(enum_range(NULL::rol_usuario)) AS role');
    const roles = rows.map((row) => row.role);
    res.json(roles);
  } catch (err) {
    next(err);
  }
}

async function listarUsuarios(req, res, next) {
  try {
    const { rol, activo, q } = req.query;
    const params = [req.tenant.id];
    const filtros = ['institucion_id = $1'];
    let index = 2;

    if (rol) {
      const rolValido = validarRol(rol);
      if (!rolValido) {
        return res.status(400).json({ error: 'Rol no válido.' });
      }
      filtros.push(`rol = $${index}`);
      params.push(rolValido);
      index += 1;
    }

    if (typeof activo !== 'undefined') {
      filtros.push(`activo = $${index}`);
      params.push(activo === 'true' || activo === true);
      index += 1;
    }

    if (q && String(q).trim()) {
      const texto = `%${String(q).trim()}%`;
      filtros.push(`(nombre_completo ILIKE $${index} OR email ILIKE $${index})`);
      params.push(texto);
      index += 1;
    }

    const where = `WHERE ${filtros.join(' AND ')}`;

    const { rows } = await query(
      `SELECT id, nombre_completo, email, rol, activo, creado_en
       FROM usuarios
       ${where}
       ORDER BY nombre_completo ASC`,
      params
    );

    res.json(rows);
  } catch (err) {
    next(err);
  }
}

async function listarUsuariosPorRol(req, res, next) {
  try {
    const rol = validarRol(req.params.rol);
    if (!rol) {
      return res.status(400).json({ error: 'Rol no válido.' });
    }

    req.query = { ...req.query, rol };
    return listarUsuarios(req, res, next);
  } catch (err) {
    next(err);
  }
}

async function crearUsuario(req, res, next) {
  try {
    const { nombreCompleto, email, password, rol } = req.body;
    const rolValido = validarRol(rol);

    if (!nombreCompleto || !email || !password || !rolValido) {
      return res.status(400).json({ error: 'nombreCompleto, email, password y rol son obligatorios.' });
    }

    const emailNormalizado = String(email).trim().toLowerCase();
    const existe = await query(
      `SELECT id FROM usuarios WHERE institucion_id = $1 AND email = $2`,
      [req.tenant.id, emailNormalizado]
    );

    if (existe.rows.length > 0) {
      return res.status(409).json({ error: 'Ya existe un usuario con ese correo en esta institución.' });
    }

    const passwordHash = await bcrypt.hash(password, 10);
    const { rows } = await query(
      `INSERT INTO usuarios (institucion_id, nombre_completo, email, password_hash, rol, activo)
       VALUES ($1, $2, $3, $4, $5, TRUE)
       RETURNING id, nombre_completo, email, rol, activo, creado_en`,
      [req.tenant.id, nombreCompleto.trim(), emailNormalizado, passwordHash, rolValido]
    );

    res.status(201).json({ usuario: rows[0], message: 'Usuario creado correctamente.' });
  } catch (err) {
    next(err);
  }
}

async function actualizarUsuario(req, res, next) {
  try {
    const { id } = req.params;
    const { nombreCompleto, email, password, rol, activo } = req.body;
    const campos = [];
    const params = [req.tenant.id, id];
    let index = 3;

    if (nombreCompleto) {
      campos.push(`nombre_completo = $${index}`);
      params.push(nombreCompleto.trim());
      index += 1;
    }

    if (email) {
      campos.push(`email = $${index}`);
      params.push(String(email).trim().toLowerCase());
      index += 1;
    }

    if (rol) {
      const rolValido = validarRol(rol);
      if (!rolValido) {
        return res.status(400).json({ error: 'Rol no válido.' });
      }
      campos.push(`rol = $${index}`);
      params.push(rolValido);
      index += 1;
    }

    if (typeof activo !== 'undefined') {
      campos.push(`activo = $${index}`);
      params.push(Boolean(activo));
      index += 1;
    }

    if (password) {
      const passwordHash = await bcrypt.hash(password, 10);
      campos.push(`password_hash = $${index}`);
      params.push(passwordHash);
      index += 1;
    }

    if (campos.length === 0) {
      return res.status(400).json({ error: 'No se enviaron campos para actualizar.' });
    }

    const { rows } = await query(
      `UPDATE usuarios SET ${campos.join(', ')}
       WHERE institucion_id = $1 AND id = $2
       RETURNING id, nombre_completo, email, rol, activo, creado_en`,
      params
    );

    if (rows.length === 0) {
      return res.status(404).json({ error: 'Usuario no encontrado en esta institución.' });
    }

    res.json(rows[0]);
  } catch (err) {
    next(err);
  }
}

async function eliminarUsuario(req, res, next) {
  try {
    const { id } = req.params;
    const { rows } = await query(
      `UPDATE usuarios SET activo = FALSE
       WHERE institucion_id = $1 AND id = $2
       RETURNING id`,
      [req.tenant.id, id]
    );

    if (rows.length === 0) {
      return res.status(404).json({ error: 'Usuario no encontrado en esta institución.' });
    }

    res.json({ success: true, id: rows[0].id, message: 'Usuario eliminado correctamente.' });
  } catch (err) {
    next(err);
  }
}

module.exports = {
  ROLES,
  listarRoles,
  listarUsuarios,
  listarUsuariosPorRol,
  crearUsuario,
  actualizarUsuario,
  eliminarUsuario,
};
