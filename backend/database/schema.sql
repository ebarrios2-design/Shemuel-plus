-- ============================================================
-- Shemuel Plus - Esquema PostgreSQL (prototipo)
-- Arquitectura multi-tenant: cada fila de negocio se ancla a
-- una institucion (tenant) via institucion_id, nunca se mezclan
-- datos entre universidades.
-- ============================================================

CREATE EXTENSION IF NOT EXISTS "pgcrypto"; -- para gen_random_uuid()

-- ------------------------------------------------------------
-- Tabla maestra de tenants: cada universidad cliente del SaaS
-- ------------------------------------------------------------
CREATE TABLE instituciones (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    nombre          VARCHAR(150) NOT NULL,
    nit             VARCHAR(30) UNIQUE,
    subdominio      VARCHAR(60) NOT NULL UNIQUE,      -- ej: 'udi' -> udi.shemuel.app
    color_primario  VARCHAR(7)  DEFAULT '#1E3A5F',    -- identidad visual del tenant
    logo_url        TEXT,
    activo          BOOLEAN DEFAULT TRUE,
    creado_en       TIMESTAMPTZ DEFAULT now()
);

CREATE TYPE rol_usuario AS ENUM (
    'estudiante',
    'docente_asesor',
    'institucion_receptora',
    'director'
);

-- ------------------------------------------------------------
-- Usuarios: pertenecen a una institucion (tenant) y tienen un rol
-- ------------------------------------------------------------
CREATE TABLE usuarios (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    institucion_id  UUID NOT NULL REFERENCES instituciones(id) ON DELETE CASCADE,
    nombre_completo VARCHAR(150) NOT NULL,
    email           VARCHAR(150) NOT NULL,
    password_hash   VARCHAR(255) NOT NULL,
    rol             rol_usuario NOT NULL,
    activo          BOOLEAN DEFAULT TRUE,
    requiere_cambio_password BOOLEAN NOT NULL DEFAULT FALSE,
    creado_en       TIMESTAMPTZ DEFAULT now(),
    -- el mismo correo puede existir en dos universidades distintas,
    -- pero no repetirse dentro de la misma institucion
    UNIQUE (institucion_id, email)
);

CREATE INDEX idx_usuarios_institucion ON usuarios(institucion_id);

-- ------------------------------------------------------------
-- Instituciones receptoras: colegios/entidades donde el
-- estudiante realiza la practica (tambien particionadas por tenant)
-- ------------------------------------------------------------
CREATE TABLE instituciones_receptoras (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    institucion_id  UUID NOT NULL REFERENCES instituciones(id) ON DELETE CASCADE,
    nombre          VARCHAR(150) NOT NULL,
    direccion       VARCHAR(200),
    contacto_nombre VARCHAR(150),
    contacto_email  VARCHAR(150),
    contacto_tel    VARCHAR(30),
    creado_en       TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX idx_ir_institucion ON instituciones_receptoras(institucion_id);

CREATE TYPE estado_asignacion AS ENUM (
    'pendiente',
    'en_curso',
    'finalizada',
    'cancelada'
);

-- ------------------------------------------------------------
-- Asignacion de practica: pertenece al tenant y puede conservar
-- una entidad receptora externa opcional por compatibilidad.
-- ------------------------------------------------------------
CREATE TABLE asignaciones_practica (
    id                        UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    institucion_id            UUID NOT NULL REFERENCES instituciones(id) ON DELETE CASCADE,
    estudiante_id             UUID NOT NULL REFERENCES usuarios(id),
    docente_id                UUID NOT NULL REFERENCES usuarios(id),
    institucion_receptora_id  UUID REFERENCES instituciones_receptoras(id),
    fecha_inicio              DATE NOT NULL,
    fecha_fin                 DATE,
    horas_requeridas          INTEGER NOT NULL DEFAULT 0,
    horas_cumplidas           INTEGER NOT NULL DEFAULT 0,
    estado                    estado_asignacion DEFAULT 'pendiente',
    creado_en                 TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX idx_asignaciones_institucion ON asignaciones_practica(institucion_id);
CREATE INDEX idx_asignaciones_estudiante ON asignaciones_practica(estudiante_id);
CREATE INDEX idx_asignaciones_docente ON asignaciones_practica(docente_id);

CREATE TABLE acreditaciones_horas (
    id                  BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    institucion_id      UUID NOT NULL REFERENCES instituciones(id) ON DELETE CASCADE,
    asignacion_id       UUID NOT NULL REFERENCES asignaciones_practica(id) ON DELETE CASCADE,
    clave_idempotencia  VARCHAR(120) NOT NULL,
    horas               INTEGER NOT NULL CHECK (horas IN (1, 3)),
    creado_en           TIMESTAMPTZ NOT NULL DEFAULT now(),
    UNIQUE (institucion_id, clave_idempotencia)
);

CREATE INDEX idx_acreditaciones_horas_asignacion
    ON acreditaciones_horas(asignacion_id);

ALTER TABLE acreditaciones_horas ENABLE ROW LEVEL SECURITY;

CREATE TYPE estado_solicitud_practica AS ENUM (
    'pendiente',
    'aprobada',
    'rechazada'
);

-- Solicitudes creadas por estudiantes antes de convertirse en asignaciones.
CREATE TABLE solicitudes_practica (
    id                        UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    institucion_id            UUID NOT NULL REFERENCES instituciones(id) ON DELETE CASCADE,
    estudiante_id             UUID NOT NULL REFERENCES usuarios(id) ON DELETE CASCADE,
    institucion_receptora_id  UUID REFERENCES instituciones_receptoras(id),
    asignacion_id             UUID REFERENCES asignaciones_practica(id),
    practica_solicitada        VARCHAR(200) NOT NULL DEFAULT 'Práctica pedagógica',
    semestre                   INTEGER NOT NULL DEFAULT 4 CHECK (semestre BETWEEN 1 AND 10),
    fecha_inicio              DATE NOT NULL,
    fecha_fin                 DATE,
    horas_requeridas          INTEGER NOT NULL CHECK (horas_requeridas > 0),
    estado                    estado_solicitud_practica NOT NULL DEFAULT 'pendiente',
    documentos_verificados     BOOLEAN NOT NULL DEFAULT FALSE,
    observacion_validacion     TEXT,
    motivo_rechazo            TEXT,
    creado_en                 TIMESTAMPTZ DEFAULT now(),
    resuelto_en               TIMESTAMPTZ
);

CREATE INDEX idx_solicitudes_practica_tenant ON solicitudes_practica(institucion_id);
CREATE INDEX idx_solicitudes_practica_estudiante ON solicitudes_practica(estudiante_id);
CREATE INDEX idx_solicitudes_practica_estado ON solicitudes_practica(institucion_id, estado);

CREATE TABLE documentos_solicitud_practica (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    solicitud_id    UUID NOT NULL REFERENCES solicitudes_practica(id) ON DELETE CASCADE,
    tipo_documento  VARCHAR(50) NOT NULL,
    nombre_archivo  VARCHAR(255) NOT NULL,
    tipo_mime       VARCHAR(100) NOT NULL,
    contenido       BYTEA NOT NULL,
    verificado      BOOLEAN NOT NULL DEFAULT FALSE,
    creado_en       TIMESTAMPTZ DEFAULT now(),
    UNIQUE (solicitud_id, tipo_documento)
);

CREATE INDEX idx_documentos_solicitud ON documentos_solicitud_practica(solicitud_id);

-- ------------------------------------------------------------
-- Evaluaciones formales (calificacion cuantitativa) que hace el
-- docente asesor sobre una asignacion. Los comentarios narrativos
-- extensos y las observaciones pedagogicas viven en MongoDB.
-- ------------------------------------------------------------
CREATE TABLE evaluaciones (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    institucion_id  UUID NOT NULL REFERENCES instituciones(id) ON DELETE CASCADE,
    asignacion_id   UUID NOT NULL REFERENCES asignaciones_practica(id) ON DELETE CASCADE,
    docente_id      UUID NOT NULL REFERENCES usuarios(id),
    fecha           DATE NOT NULL DEFAULT CURRENT_DATE,
    calificacion    NUMERIC(3,1) CHECK (calificacion >= 0 AND calificacion <= 5.0),
    creado_en       TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX idx_evaluaciones_institucion ON evaluaciones(institucion_id);
CREATE INDEX idx_evaluaciones_asignacion ON evaluaciones(asignacion_id);
