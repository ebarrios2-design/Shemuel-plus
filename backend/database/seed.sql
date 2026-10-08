-- ============================================================
-- Datos de prueba para desarrollo local
-- Password para todos los usuarios de ejemplo: "Practica2026*"
-- (hash generado con bcryptjs, ver database/init.js)
-- ============================================================

INSERT INTO instituciones (id, nombre, nit, subdominio, color_primario)
VALUES
    ('11111111-1111-1111-1111-111111111111', 'Universidad de Investigacion y Desarrollo', '890.000.111-1', 'udi', '#1E3A5F'),
    ('22222222-2222-2222-2222-222222222222', 'Universidad Autonoma del Norte', '890.000.222-2', 'uan', '#5F1E2E');

-- El password_hash real se inserta desde database/init.js (bcrypt no es
-- reproducible con un simple INSERT estatico). Este archivo deja los
-- usuarios "de forma" para que init.js los complete.
