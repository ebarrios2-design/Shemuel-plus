const multer = require('multer');
const path = require('path');

const tiposPermitidos = new Set([
  '.pdf',
  '.doc',
  '.docx',
  '.ppt',
  '.pptx',
  '.xls',
  '.xlsx',
  '.jpg',
  '.jpeg',
  '.png',
  '.txt',
]);

const actividadUpload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 8 * 1024 * 1024, files: 1 },
  fileFilter: (req, file, callback) => {
    if (!tiposPermitidos.has(path.extname(file.originalname).toLowerCase())) {
      const error = new Error('Tipo de archivo no permitido. Usa PDF, Office, imagen o texto.');
      error.status = 400;
      callback(error);
      return;
    }

    callback(null, true);
  },
});

function recibirActividad(req, res, next) {
  actividadUpload.single('archivo')(req, res, (err) => {
    if (!err) return next();

    if (err instanceof multer.MulterError && err.code === 'LIMIT_FILE_SIZE') {
      return res.status(413).json({ error: 'El archivo no puede superar los 8 MB.' });
    }

    return res.status(err.status || 400).json({ error: err.message });
  });
}

module.exports = recibirActividad;
