const User = require('../models/User');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const mongoose = require('mongoose');
const crypto = require('crypto');      // built-in Node module – no install needed
const nodemailer = require('nodemailer');

// Helper to check DB connection
const isDbConnected = () => mongoose.connection.readyState === 1;

// Signup
exports.signup = async (req, res) => {
  console.log('Signup Attempt:', req.body.email);
  let { username, email, password, role } = req.body;

  // Normalize inputs
  email = email.toLowerCase();
  username = username.toLowerCase();

  // Normalize role to match Model Enum (Teacher/Student)
  if (role) {
    role = role.charAt(0).toUpperCase() + role.slice(1).toLowerCase();
  } else {
    role = 'Student';
  }

  if (!isDbConnected()) {
    console.log('DB Not Connected. Using Emergency Signup...');
    const token = jwt.sign({ user: { id: 'emergency-' + Date.now(), role } }, process.env.JWT_SECRET);
    return res.json({ token, user: { username, email, role }, msg: 'Logged in via Emergency Mode (DB Offline)' });
  }

  try {
    let user = await User.findOne({ email });
    if (user) return res.status(400).json({ msg: 'User already exists with this email' });

    // Also check if username exists
    let userByName = await User.findOne({ username });
    if (userByName) return res.status(400).json({ msg: 'Username already taken' });

    user = new User({ username, email, password, role });
    const salt = await bcrypt.genSalt(10);
    user.password = await bcrypt.hash(password, salt);
    await user.save();

    const payload = { user: { id: user.id, role: user.role } };
    jwt.sign(payload, process.env.JWT_SECRET, { expiresIn: 36000 }, (err, token) => {
      if (err) throw err;
      res.json({ token, user: { id: user.id, username: user.username, role: user.role } });
    });
  } catch (err) {
    console.error('Signup Error:', err.message);
    res.status(500).json({ msg: 'Server Database Error: ' + err.message });
  }
};

// Login
exports.login = async (req, res) => {
  console.log('Login Attempt:', req.body.email);
  let { email, password, role } = req.body;

  // Normalize input
  email = email.toLowerCase();

  if (!isDbConnected()) {
    console.log('DB Not Connected. Using Emergency Login...');
    // In emergency mode, we trust the role sent by the frontend for testing
    const token = jwt.sign({ user: { id: 'emergency-123', role: role || 'Teacher' } }, process.env.JWT_SECRET);
    return res.json({ token, user: { id: 'emergency-123', username: email.split('@')[0], role: role || 'Teacher' }, msg: 'Logged in via Emergency Mode (DB Offline)' });
  }

  try {
    let user = await User.findOne({ email });
    if (!user) return res.status(400).json({ msg: 'Email does not exist. Please sign up.' });

    const isMatch = await bcrypt.compare(password, user.password);
    if (!isMatch) return res.status(400).json({ msg: 'Invalid Password' });

    const payload = { user: { id: user.id, role: user.role } };
    jwt.sign(payload, process.env.JWT_SECRET, { expiresIn: 36000 }, (err, token) => {
      if (err) throw err;
      res.json({ token, user: { id: user.id, username: user.username, role: user.role } });
    });
  } catch (err) {
    console.error('Login Error:', err.message);
    res.status(500).json({ msg: 'Server Database Error: ' + err.message });
  }
};

// =====================================================================
// FORGOT PASSWORD  – Step 1: generate token and send magic-link email
// =====================================================================
exports.forgotPassword = async (req, res) => {
  let { email } = req.body;
  if (!email) return res.status(400).json({ msg: 'Email is required' });
  email = email.toLowerCase().trim();

  try {
    const user = await User.findOne({ email });
    // Always return 200 so we don't leak whether an email exists
    if (!user) {
      return res.json({ msg: 'If that email is registered, a reset link has been sent.' });
    }

    // Generate a secure random token (plain) and store its SHA-256 hash
    const rawToken    = crypto.randomBytes(32).toString('hex');
    const hashedToken = crypto.createHash('sha256').update(rawToken).digest('hex');

    user.resetToken       = hashedToken;
    user.resetTokenExpiry = Date.now() + 60 * 60 * 1000; // 1 hour
    await user.save();

    // Build the magic link (plain token goes in the URL, not the hash)
    const frontendUrl = process.env.FRONTEND_URL || 'http://localhost:5173';
    const magicLink   = `${frontendUrl}?reset_token=${rawToken}&email=${encodeURIComponent(email)}`;

    // ---- Guard: email credentials must be configured ----------------------
    if (!process.env.EMAIL_USER || process.env.EMAIL_USER === 'your-email@gmail.com') {
      console.error('ForgotPassword: EMAIL_USER is not configured in .env');
      return res.status(500).json({ msg: 'Email service is not configured on the server. Please contact the admin.' });
    }

    // ---- Nodemailer transporter (with timeouts so it never hangs) ----------
    const transporter = nodemailer.createTransport({
      service: process.env.EMAIL_SERVICE || 'gmail',
      auth: {
        user: process.env.EMAIL_USER,
        pass: process.env.EMAIL_PASS,
      },
      connectionTimeout: 10000,  // 10 s – fail fast if Gmail unreachable
      greetingTimeout:   10000,
      socketTimeout:     15000,
    });

    const mailOptions = {
      from: `"CollabCode" <${process.env.EMAIL_USER}>`,
      to: email,
      subject: '🔑 CollabCode – Password Reset Link',
      html: `
        <div style="font-family:Arial,sans-serif;max-width:600px;margin:auto;background:#1E1E2F;padding:32px;border-radius:12px">
          <h2 style="color:#2ecc71;margin-bottom:8px">CollabCode</h2>
          <h3 style="color:#fff;margin-top:0">Password Reset Request</h3>
          <p style="color:#ccc">Hi <strong style="color:#fff">${user.username}</strong>,</p>
          <p style="color:#ccc">We received a request to reset your password. Click the button below – this link expires in <strong style="color:#2ecc71">1 hour</strong>.</p>
          <a href="${magicLink}"
             style="display:inline-block;margin:24px 0;padding:14px 32px;
                    background:#2ecc71;color:#fff;text-decoration:none;
                    border-radius:8px;font-weight:bold;font-size:16px">
            Reset My Password
          </a>
          <p style="color:#888;font-size:12px">If you didn't request this, you can safely ignore this email.</p>
          <p style="color:#888;font-size:12px">Or copy this link:<br>
            <span style="color:#2ecc71;word-break:break-all">${magicLink}</span>
          </p>
        </div>
      `,
    };

    // Race sendMail against a 15-second hard timeout so the server never hangs
    await Promise.race([
      transporter.sendMail(mailOptions),
      new Promise((_, reject) =>
        setTimeout(() => reject(new Error('Email sending timed out after 15 seconds. Check EMAIL_USER / EMAIL_PASS in .env')), 15000)
      ),
    ]);

    console.log('Password reset email sent to:', email);
    return res.json({ msg: 'If that email is registered, a reset link has been sent.' });

  } catch (err) {
    console.error('ForgotPassword Error:', err.message);
    res.status(500).json({ msg: 'Server error sending reset email: ' + err.message });
  }
};

// =====================================================================
// RESET PASSWORD  – Step 2: validate token and save new password
// =====================================================================
exports.resetPassword = async (req, res) => {
  const { token, email, newPassword } = req.body;

  if (!token || !email || !newPassword) {
    return res.status(400).json({ msg: 'Token, email and new password are required' });
  }
  if (newPassword.length < 6) {
    return res.status(400).json({ msg: 'Password must be at least 6 characters' });
  }

  try {
    // Hash the raw token from the URL and compare to the stored hash
    const hashedToken = crypto.createHash('sha256').update(token).digest('hex');

    const user = await User.findOne({
      email: email.toLowerCase().trim(),
      resetToken: hashedToken,
      resetTokenExpiry: { $gt: Date.now() },   // must not be expired
    });

    if (!user) {
      return res.status(400).json({ msg: 'Invalid or expired reset link. Please request a new one.' });
    }

    // Hash and save the new password, then clear the reset fields
    const salt = await bcrypt.genSalt(10);
    user.password         = await bcrypt.hash(newPassword, salt);
    user.resetToken       = null;
    user.resetTokenExpiry = null;
    await user.save();

    return res.json({ msg: 'Password updated successfully. You can now log in.' });

  } catch (err) {
    console.error('ResetPassword Error:', err.message);
    res.status(500).json({ msg: 'Server error resetting password: ' + err.message });
  }
};
