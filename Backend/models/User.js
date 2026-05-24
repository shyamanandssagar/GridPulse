const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');

const userSchema = new mongoose.Schema(
  {
    name: { type: String, required: true, trim: true },
    email: {
      type: String,
      required: true,
      unique: true,
      lowercase: true,
      trim: true,
      match: [/^\S+@\S+\.\S+$/, 'Invalid email'],
    },
    // Required for local accounts, optional for Google-auth users
    password: {
      type: String,
      minlength: 6,
      select: false,
      required: function () {
        return this.authProvider === 'local';
      },
    },
    role: {
      type: String,
      enum: ['admin', 'user'],
      default: 'user',
      index: true,
    },
    // For role:'user' — meters they own/are allowed to see.
    assignedMeters: [
      { type: mongoose.Schema.Types.ObjectId, ref: 'Meter' },
    ],
    // Authentication provider
    authProvider: {
      type: String,
      enum: ['local', 'google'],
      default: 'local',
    },
    // Google OAuth unique ID
    googleId: {
      type: String,
      unique: true,
      sparse: true,
    },
    // Optional Google profile image
    avatar: String,
    // Email verification status
    isVerified: {
      type: Boolean,
      default: false,
    },
    // Email verification OTP
    otp: {
      type: String,
      select: false,
    },
    otpExpiresAt: Date,
    // Forgot password OTP
    resetPasswordOtp: {
      type: String,
      select: false,
    },
    resetPasswordExpires: Date,
    lastLoginAt: Date,
  },
  { timestamps: true }
);

// Hash password before save (only when changed)
userSchema.pre('save', async function (next) {
  // Skip hashing if password doesn't exist
  // (important for Google-auth users)
  if (!this.password || !this.isModified('password')) {
    return next();
  }
  const salt = await bcrypt.genSalt(10);
  this.password = await bcrypt.hash(this.password, salt);
  next();
});

// NOTE: password has `select: false`, so the calling query MUST opt in:
//   User.findOne({ email }).select('+password')

userSchema.methods.matchPassword = async function (entered) {
  if (!this.password) return false; // e.g. Google user with no local password
  return bcrypt.compare(entered, this.password);
};

// Strip sensitive fields whenever serialised to JSON
userSchema.set('toJSON', {
  transform: (_doc, ret) => {
    delete ret.password;
    delete ret.otp;
    delete ret.resetPasswordOtp;
    delete ret.otpExpiresAt;
    delete ret.resetPasswordExpires;
    return ret;
  },
});

module.exports = mongoose.model('User', userSchema);