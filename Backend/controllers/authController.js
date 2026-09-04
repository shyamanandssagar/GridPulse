const crypto = require('crypto');
const asyncHandler = require('express-async-handler');
const jwt = require('jsonwebtoken');
const bcrypt = require('bcryptjs');
const { OAuth2Client } = require('google-auth-library');
const User = require('../models/User');
const { sendOtpEmail } = require('../utils/mailer');

const googleClient = new OAuth2Client(process.env.GOOGLE_CLIENT_ID);

const OTP_TTL_MIN = Number(process.env.OTP_EXPIRES_MIN) || 10;
const OTP_MAX_ATTEMPTS = 5;
const OTP_RESEND_COOLDOWN_MS = 60 * 1000; 

const signToken = (user) =>
  jwt.sign({ id: user._id, role: user.role }, process.env.JWT_SECRET, {
    expiresIn: process.env.JWT_EXPIRES || '7d',
  });


const generateOtp = () => String(crypto.randomInt(0, 1_000_000)).padStart(6, '0');

// POST /api/auth/login
const login = asyncHandler(async (req, res) => {
  const { email, password } = req.body;
  if (!email || !password) {
    res.status(400);
    throw new Error('email and password are required');
  }
  
  const user = await User.findOne({ email: email.toLowerCase() }).select('+password');
  if (!user || !(await user.matchPassword(password))) {
    res.status(401);
    throw new Error('Invalid credentials');
  }
  user.lastLoginAt = new Date();
  await user.save();
  res.json({
    token: signToken(user),
    user: user.toJSON(),
  });
});

// Google login only for existing users
// accounts are created by admin
const googleLogin = asyncHandler(async (req, res) => {
  const { idToken } = req.body;
  if (!idToken) {
    res.status(400);
    throw new Error('idToken is required');
  }
  if (!process.env.GOOGLE_CLIENT_ID) {
    res.status(500);
    throw new Error('Google sign-in is not configured on the server');
  }

// verify Google token
  let payload;
  try {
    const ticket = await googleClient.verifyIdToken({
      idToken,
      audience: process.env.GOOGLE_CLIENT_ID,
    });
    payload = ticket.getPayload();
  } catch (e) {
    res.status(401);
    throw new Error('Invalid Google token');
  }

  if (!payload?.email || !payload.email_verified) {
    res.status(401);
    throw new Error('Google account email is not verified');
  }

  const email = payload.email.toLowerCase();
  const user = await User.findOne({ email });

  // no pre-existing account → no entry.
  if (!user) {
    res.status(403);
    throw new Error('No account is registered for this Google email. Contact your administrator.');
  }

// link Google account on first login
  if (!user.googleId) {
    user.googleId = payload.sub;
  } else if (user.googleId !== payload.sub) {
    res.status(401);
    throw new Error('This email is linked to a different Google account');
  }

  user.lastLoginAt = new Date();
  await user.save();

  res.json({
    token: signToken(user),
    user: user.toJSON(),
  });
});

// POST /api/auth/forgot-password — issue a reset OTP.
// same response for all emails
// prevents account detection
const forgotPassword = asyncHandler(async (req, res) => {
  const { email } = req.body;
  if (!email) {
    res.status(400);
    throw new Error('email is required');
  }

  const generic = { message: 'If an account exists for that email, a reset code has been sent.' };
  const user = await User.findOne({ email: email.toLowerCase() }).select(
    '+resetOtpExpires +resetOtpSentAt'
  );
  if (!user) return res.json(generic); // hide whether account exists


  if (user.resetOtpSentAt && Date.now() - user.resetOtpSentAt.getTime() < OTP_RESEND_COOLDOWN_MS) {
    return res.json(generic);
  }

  const otp = generateOtp();
  user.resetOtpHash = await bcrypt.hash(otp, 10);
  user.resetOtpExpires = new Date(Date.now() + OTP_TTL_MIN * 60 * 1000);
  user.resetOtpAttempts = 0;
  user.resetOtpSentAt = new Date();
  await user.save();

  await sendOtpEmail(user.email, otp, OTP_TTL_MIN);
  res.json(generic);
});

// shared OTP validator
// does not consume OTP
async function checkOtp(res, email, otp) {
  if (!email || !otp) {
    res.status(400);
    throw new Error('email and otp are required');
  }
  const user = await User.findOne({ email: String(email).toLowerCase() }).select(
    '+password +resetOtpHash +resetOtpExpires +resetOtpAttempts'
  );
  if (!user || !user.resetOtpHash || !user.resetOtpExpires) {
    res.status(400);
    throw new Error('No active reset request for this account');
  }
  if (user.resetOtpExpires.getTime() < Date.now()) {
    res.status(400);
    throw new Error('Reset code has expired. Please request a new one.');
  }
  if (user.resetOtpAttempts >= OTP_MAX_ATTEMPTS) {
    res.status(429);
    throw new Error('Too many incorrect attempts. Please request a new code.');
  }

  const ok = await bcrypt.compare(String(otp), user.resetOtpHash);
  if (!ok) {
    user.resetOtpAttempts += 1;
    await user.save();
    res.status(400);
    throw new Error('Incorrect reset code');
  }
  return user;
}

// POST /api/auth/verify-otp 
// verify OTP before reset
const verifyOtp = asyncHandler(async (req, res) => {
  const { email, otp } = req.body;
  await checkOtp(res, email, otp);
  res.json({ valid: true });
});

// POST /api/auth/reset-password 
// reset password after OTP check
const resetPassword = asyncHandler(async (req, res) => {
  const { email, otp, password } = req.body;
  if (!password || password.length < 6) {
    res.status(400);
    throw new Error('Password must be at least 6 characters');
  }
  const user = await checkOtp(res, email, otp);

  user.password = password; 
  user.resetOtpHash = undefined;
  user.resetOtpExpires = undefined;
  user.resetOtpAttempts = 0;
  user.resetOtpSentAt = undefined;
  await user.save();

  res.json({ message: 'Password has been reset. You can now sign in.' });
});

// GET /api/auth/me
const me = asyncHandler(async (req, res) => {
  const fresh = await User.findById(req.user._id).populate('assignedMeters', 'serial customerName').lean();
  res.json(fresh);
});

module.exports = { login, googleLogin, forgotPassword, verifyOtp, resetPassword, me };
