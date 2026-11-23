function responderError(res, status, error) {
  return res.status(status).json({ error });
}

module.exports = { responderError };
