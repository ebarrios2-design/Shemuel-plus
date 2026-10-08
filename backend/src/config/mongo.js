const mongoose = require('mongoose');

// Conexion a MongoDB: aqui viven los datos flexibles y con forma
// variable entre instituciones (planes de clase, hojas de vida,
// observaciones pedagogicas, evidencias adjuntas).
async function connectMongo() {
  mongoose.set('strictQuery', true);

  await mongoose.connect(process.env.MONGO_URI, {
    // mongoose 8 ya no necesita useNewUrlParser/useUnifiedTopology,
    // se dejan fuera a proposito.
  });

  const conn = mongoose.connection;
  conn.on('error', (err) => console.error('[mongo] Error de conexion:', err.message));
  conn.once('open', () => console.log(`[mongo] Conectado a ${conn.name}`));

  return conn;
}

module.exports = { connectMongo, mongoose };
