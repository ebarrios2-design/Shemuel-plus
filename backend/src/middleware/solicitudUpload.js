const multer = require('multer');
const path = require('path');

const tiposPermitidos = new Set(['.pdf', '.jpg', '.jpeg', '.png']);
const solicitudUpload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 8 * 1024 * 1024, files: 3 },
  fileFilter: (_req, file, callback) => {
    if (!tiposPermitidos.has(path.extname(file.originalname).toLowerCase())) {
      const error = new Error('Los documentos deben ser PDF, JPG o PNG.');
      error.status = 400;
      callback(error);
      return;
    }
    callback(null, true);
  },
});

function recibirSolicitud(req, res, next) {
  solicitudUpload.fields([
    { name: 'cedula', maxCount: 1 },
    { name: 'reciboSemestre', maxCount: 1 },
    { name: 'certificacionMaterias', maxCount: 1 },
  ])(req, res, (err) => {
    if (!err) return next();
    if (err instanceof multer.MulterError && err.code === 'LIMIT_FILE_SIZE') {
      return res.status(413).json({ error: 'Cada documento no puede superar los 8 MB.' });
    }
    return res.status(err.status || 400).json({ error: err.message });
  });
}

module.exports = recibirSolicitud;
