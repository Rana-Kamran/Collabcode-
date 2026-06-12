const mongoose = require('mongoose');

const UserSchema = new mongoose.Schema({
  username: {
    type: String,
    required: true,
    unique: true,
    lowercase: true
  },
  email: {
    type: String,
    required: true,
    unique: true,
    lowercase: true
  },
  password: {
    type: String,
    required: true
  },
  role: {
    type: String,
    enum: ['Teacher', 'Student'],
    default: 'Student',
    set: v => v.charAt(0).toUpperCase() + v.slice(1).toLowerCase()
  },
  date: {
    type: Date,
    default: Date.now
  },
  // ===== Password Reset (Magic Link) =====
  resetToken: {
    type: String,
    default: null
  },
  resetTokenExpiry: {
    type: Date,
    default: null
  },
  // ===== Email Verification =====
  isVerified: {
    type: Boolean,
    default: false
  },
  verifyToken: {
    type: String,
    default: null
  }
});

module.exports = mongoose.model('user', UserSchema);
