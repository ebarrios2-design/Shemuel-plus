const { mongoose } = require('../../config/mongo');

const preguntaSchema = new mongoose.Schema(
  {
    pregunta: { type: String, required: true, trim: true },
    opciones: {
      type: [{ type: String, required: true, trim: true }],
      validate: (opciones) => opciones.length >= 2,
    },
    respuestaCorrecta: { type: Number, required: true, min: 0 },
  },
  { _id: false }
);

const tallerSchema = new mongoose.Schema(
  {
    tenantId: { type: String, required: true, index: true },
    asignacionId: { type: String, required: true, index: true },
    docenteId: { type: String, required: true },
    titulo: { type: String, required: true, trim: true },
    instrucciones: { type: String, required: true, trim: true },
    preguntas: {
      type: [preguntaSchema],
      validate: (preguntas) => preguntas.length >= 1 && preguntas.length <= 20,
    },
    quizActivado: { type: Boolean, default: false },
  },
  { timestamps: true }
);

tallerSchema.index({ tenantId: 1, asignacionId: 1 });

module.exports = mongoose.model('Taller', tallerSchema);
