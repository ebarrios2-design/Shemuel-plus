const express = require('express');
const router = express.Router();
const { login } = require('../controllers/auth.controller');

// POST /api/auth/login  (requiere que resolveTenant ya haya corrido)
router.post('/login', login);

module.exports = router;
