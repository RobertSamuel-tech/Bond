function error(res, statusCode, message) {
  return res.status(statusCode).json({ ok: false, error: message });
}

module.exports = { error };
