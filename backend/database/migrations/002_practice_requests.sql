DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_type
        WHERE typname = 'estado_solicitud_practica'
          AND typnamespace = 'public'::regnamespace
    ) THEN
        CREATE TYPE estado_solicitud_practica AS ENUM ('pendiente', 'aprobada', 'rechazada');
    END IF;
END $$;

CREATE TABLE IF NOT EXISTS solicitudes_practica (
    id                        UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    institucion_id            UUID NOT NULL REFERENCES instituciones(id) ON DELETE CASCADE,
    estudiante_id             UUID NOT NULL REFERENCES usuarios(id) ON DELETE CASCADE,
    institucion_receptora_id  UUID REFERENCES instituciones_receptoras(id),
    asignacion_id             UUID REFERENCES asignaciones_practica(id),
    fecha_inicio              DATE NOT NULL,
    fecha_fin                 DATE,
    horas_requeridas          INTEGER NOT NULL CHECK (horas_requeridas > 0),
    estado                    estado_solicitud_practica NOT NULL DEFAULT 'pendiente',
    motivo_rechazo            TEXT,
    creado_en                 TIMESTAMPTZ DEFAULT now(),
    resuelto_en               TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_solicitudes_practica_tenant ON solicitudes_practica(institucion_id);
CREATE INDEX IF NOT EXISTS idx_solicitudes_practica_estudiante ON solicitudes_practica(estudiante_id);
CREATE INDEX IF NOT EXISTS idx_solicitudes_practica_estado ON solicitudes_practica(institucion_id, estado);
