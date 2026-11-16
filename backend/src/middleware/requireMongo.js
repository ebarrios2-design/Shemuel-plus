const { mongoose } = require('../config/mongo');

function requireMongo(req, res, next) {
  if (mongoose.connection.readyState !== 1) {
    return res.status(503).json({
      error: 'MongoDB no está disponible. Esta operación requiere la base documental.',
    });
  }

  next();
}

module.exports = requireMongo;
