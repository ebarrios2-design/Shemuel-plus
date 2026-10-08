const { mongoose } = require('../../config/mongo');

const hojaVidaSchema = new mongoose.Schema(
  {
    tenantId: { type: String, required: true, index: true },
    usuarioId: { type: String, required: true, unique: true },
    datosPersonales: { type: mongoose.Schema.Types.Mixed },
    formacionAcademica: [{ type: mongoose.Schema.Types.Mixed }],
    experiencia: [{ type: mongoose.Schema.Types.Mixed }],
    archivoUrl: { type: String },
  },
  { timestamps: true }
);

module.exports = mongoose.model('HojaVida', hojaVidaSchema);
