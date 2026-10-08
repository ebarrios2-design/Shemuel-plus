const { mongoose } = require('../../config/mongo');

// Observaciones que el docente asesor registra en cada visita/seguimiento.
// El contenido narrativo y la cantidad de evidencias por visita varian
// mucho, por lo que no se fuerza a un esquema relacional rigido.
const observacionSchema = new mongoose.Schema(
  {
    tenantId: { type: String, required: true, index: true },
    asignacionId: { type: String, required: true, index: true },
    docenteId: { type: String, required: true },
    categoria: { type: String, enum: ['seguimiento', 'visita', 'alerta', 'cierre'], default: 'seguimiento' },
    observacion: { type: String, required: true },
    evidenciasUrls: [{ type: String }],
    fecha: { type: Date, default: Date.now },
  },
  { timestamps: true }
);

module.exports = mongoose.model('Observacion', observacionSchema);
