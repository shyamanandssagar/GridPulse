const express = require('express');
const {
  login,
  googleLogin,
  forgotPassword,
  verifyOtp,
  resetPassword,
  me,
} = require('../controllers/authController');
const { protect } = require('../middleware/authMiddleware');

const router = express.Router();

// There is intentionally no public signup.
router.post('/login', login);
router.post('/google', googleLogin);


router.post('/forgot-password', forgotPassword);
router.post('/verify-otp', verifyOtp);
router.post('/reset-password', resetPassword);

router.get('/me', protect, me);

module.exports = router;
