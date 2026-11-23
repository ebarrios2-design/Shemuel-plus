require('dotenv').config();
const bcrypt = require('bcryptjs');
const postgres = require('../src/config/postgres');

const admins = [
  { subdominio: 'udi', nombre: 'Administración UDI', email: 'admin@udi.edu.co' },
  { subdominio: 'uan', nombre: 'Administración UAN', email: 'admin@uan.edu.co' },
];

async function seedInstitutionAdmins() {
  const initialPassword = process.env.INSTITUTION_ADMIN_INITIAL_PASSWORD;
  if (!initialPassword) {
    throw new Error('Define INSTITUTION_ADMIN_INITIAL_PASSWORD temporalmente antes de ejecutar este aprovisionamiento.');
  }

  const client = await postgres.pool.connect();

  try {
    await client.query('BEGIN');
    for (const admin of admins) {
      const passwordHash = await bcrypt.hash(initialPassword, 10);
      const tenant = await client.query(
        'SELECT id FROM instituciones WHERE subdominio = $1 AND activo = TRUE',
        [admin.subdominio]
      );
      if (tenant.rows.length !== 1) {
        throw new Error(`No se encontró una institución activa con subdominio "${admin.subdominio}".`);
      }

      await client.query(
        `INSERT INTO usuarios (
           institucion_id, nombre_completo, email, password_hash, rol, activo, requiere_cambio_password
         )
         VALUES ($1, $2, $3, $4, 'institucion_receptora', TRUE, TRUE)
         ON CONFLICT (institucion_id, email) DO UPDATE
         SET nombre_completo = EXCLUDED.nombre_completo,
             password_hash = EXCLUDED.password_hash,
             rol = EXCLUDED.rol,
             activo = TRUE,
             requiere_cambio_password = TRUE`,
        [tenant.rows[0].id, admin.nombre, admin.email, passwordHash]
      );
    }

    await client.query('COMMIT');
    console.log('Cuentas administrativas institucionales aprovisionadas; el cambio de contraseña es obligatorio.');
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
    await postgres.pool.end();
  }
}

seedInstitutionAdmins().catch((err) => {
  console.error('Error aprovisionando las cuentas institucionales:', err.message);
  process.exitCode = 1;
});
