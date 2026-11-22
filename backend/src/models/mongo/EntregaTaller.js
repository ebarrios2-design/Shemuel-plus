const { mongoose } = require('../../config/mongo');

const entregaTallerSchema = new mongoose.Schema(
  {
    tenantId: { type: String, required: true, index: true },
    tallerId: { type: mongoose.Schema.Types.ObjectId, ref: 'Taller', required: true },
    asignacionId: { type: String, required: true },
    estudianteId: { type: String, required: true },
    actividadIniciadaEn: { type: Date },
    archivo: {
      nombre: { type: String },
      tipo: { type: String },
      datos: { type: Buffer },
    },
    comentario: { type: String, maxlength: 2000 },
    actividadEntregadaEn: { type: Date },
    entregaTardia: { type: Boolean, default: false },
    horasActividadAcreditadas: { type: Boolean, default: false },
    quizIniciadoEn: { type: Date },
    respuestas: [{ pregunta: Number, opcion: Number }],
    quizFinalizadoEn: { type: Date },
    puntaje: { type: Number, min: 0, max: 100 },
    horasQuizAcreditadas: { type: Boolean, default: false },
  },
  { timestamps: true }
);

entregaTallerSchema.index(
  { tenantId: 1, tallerId: 1, estudianteId: 1 },
  { unique: true }
);

module.exports = mongoose.model('EntregaTaller', entregaTallerSchema);
