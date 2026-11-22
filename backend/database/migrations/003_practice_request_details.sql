ALTER TABLE solicitudes_practica
  ADD COLUMN IF NOT EXISTS practica_solicitada VARCHAR(200) NOT NULL DEFAULT 'Práctica pedagógica',
  ADD COLUMN IF NOT EXISTS semestre INTEGER NOT NULL DEFAULT 4 CHECK (semestre BETWEEN 1 AND 10),
  ADD COLUMN IF NOT EXISTS documentos_verificados BOOLEAN NOT NULL DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS observacion_validacion TEXT;

CREATE TABLE IF NOT EXISTS documentos_solicitud_practica (
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

CREATE INDEX IF NOT EXISTS idx_documentos_solicitud
  ON documentos_solicitud_practica(solicitud_id);
