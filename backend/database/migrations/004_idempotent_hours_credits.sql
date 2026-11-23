CREATE TABLE IF NOT EXISTS acreditaciones_horas (
    id                  BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    institucion_id      UUID NOT NULL REFERENCES instituciones(id) ON DELETE CASCADE,
    asignacion_id       UUID NOT NULL REFERENCES asignaciones_practica(id) ON DELETE CASCADE,
    clave_idempotencia  VARCHAR(120) NOT NULL,
    horas               INTEGER NOT NULL CHECK (horas IN (1, 3)),
    creado_en           TIMESTAMPTZ NOT NULL DEFAULT now(),
    UNIQUE (institucion_id, clave_idempotencia)
);

CREATE INDEX IF NOT EXISTS idx_acreditaciones_horas_asignacion
    ON acreditaciones_horas(asignacion_id);

ALTER TABLE acreditaciones_horas ENABLE ROW LEVEL SECURITY;
