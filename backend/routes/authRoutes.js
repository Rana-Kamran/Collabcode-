const express = require('express');
const router = express.Router();
const { signup, login, forgotPassword, resetPassword, verifyEmail } = require('../controllers/authController');

router.post('/signup', signup);
router.post('/login', login);
router.post('/forgot-password', forgotPassword);
router.post('/reset-password',  resetPassword);
router.get('/verify-email', verifyEmail);

module.exports = router;
