const { mongoose } = require('../../config/mongo');

// Los planes de clase varian bastante en estructura de una licenciatura
// a otra (secciones, rubricas, anexos), por eso viven en Mongo en vez
// de forzarlos a columnas fijas de Postgres.
const planClaseSchema = new mongoose.Schema(
  {
    tenantId: { type: String, required: true, index: true }, // institucion_id (Postgres UUID)
    asignacionId: { type: String, required: true, index: true }, // asignaciones_practica.id
    estudianteId: { type: String, required: true },
    titulo: { type: String, required: true },
    area: { type: String },
    objetivos: [{ type: String }],
    contenido: { type: mongoose.Schema.Types.Mixed }, // estructura libre por institucion
    archivoUrl: { type: String },
    fecha: { type: Date, default: Date.now },
  },
  { timestamps: true }
);

module.exports = mongoose.model('PlanClase', planClaseSchema);
