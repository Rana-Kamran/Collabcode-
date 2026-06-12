const User = require('../models/User');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const mongoose = require('mongoose');
const crypto = require('crypto');      // built-in Node module – no install needed
const https = require('https');

// Helper to send email via Resend API (HTTP POST)
const sendEmailViaResend = ({ to, subject, html }) => {
  return new Promise((resolve, reject) => {
    const apiKey = process.env.RESEND_API_KEY;
    if (!apiKey) {
      return reject(new Error('RESEND_API_KEY is not defined in the environment.'));
    }

    const postData = JSON.stringify({
      from: 'CollabCode <onboarding@resend.dev>',
      to: [to],
      subject: subject,
      html: html,
    });

    const options = {
      hostname: 'api.resend.com',
      port: 443,
      path: '/emails',
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${apiKey}`,
        'Content-Length': Buffer.byteLength(postData),
      },
    };

    const req = https.request(options, (res) => {
      let data = '';
      res.on('data', (chunk) => {
        data += chunk;
      });
      res.on('end', () => {
        if (res.statusCode >= 200 && res.statusCode < 300) {
          try {
            resolve(JSON.parse(data));
          } catch (e) {
            resolve({ id: 'success-no-json', raw: data });
          }
        } else {
          reject(new Error(`Resend API returned status ${res.statusCode}: ${data}`));
        }
      });
    });

    req.on('error', (err) => {
      reject(err);
    });

    // Set connection timeout
    req.on('timeout', () => {
      req.destroy();
      reject(new Error('Connection timed out while sending request to Resend.'));
    });
    
    // 10 second timeout
    req.setTimeout(10000);

    req.write(postData);
    req.end();
  });
};


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

    // Generate verification token
    const verifyToken = crypto.randomBytes(32).toString('hex');

    user = new User({ username, email, password, role, verifyToken });
    const salt = await bcrypt.genSalt(10);
    user.password = await bcrypt.hash(password, salt);
    await user.save();

    // Send verification email using Resend API (if configured)
    if (process.env.RESEND_API_KEY) {
      try {
        const verificationLink = `${req.protocol}://${req.get('host')}/api/auth/verify-email?token=${verifyToken}`;

        const emailHtml = `
          <div style="font-family:Arial,sans-serif;max-width:600px;margin:auto;background:#1E1E2F;padding:32px;border-radius:12px">
            <h2 style="color:#2ecc71;margin-bottom:8px">CollabCode</h2>
            <h3 style="color:#fff;margin-top:0">Email Verification Required</h3>
            <p style="color:#ccc">Hi <strong style="color:#fff">${user.username}</strong>,</p>
            <p style="color:#ccc">Thank you for signing up for CollabCode! Please verify your email address by clicking the button below:</p>
            <a href="${verificationLink}"
               style="display:inline-block;margin:24px 0;padding:14px 32px;
                      background:#2ecc71;color:#fff;text-decoration:none;
                      border-radius:8px;font-weight:bold;font-size:16px">
              Verify My Email
            </a>
            <p style="color:#888;font-size:12px">If you did not register for CollabCode, you can safely ignore this email.</p>
            <p style="color:#888;font-size:12px">Or copy this link:<br>
              <span style="color:#2ecc71;word-break:break-all">${verificationLink}</span>
            </p>
          </div>
        `;

        await sendEmailViaResend({
          to: email,
          subject: '📧 CollabCode – Email Verification',
          html: emailHtml,
        });

        console.log('Verification email sent to:', email);
      } catch (emailErr) {
        console.error('Signup Verification Email Error:', emailErr.message);
      }
    } else {
      console.warn('Signup: Resend API key not configured. Verification email not sent.');
    }

    // Always require email verification — never return a login token on signup
    return res.json({ msg: 'Registration successful! Please check your email to verify your account before logging in.' });
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

    // Check if user is verified
    if (!user.isVerified) {
      return res.status(403).json({ msg: 'Please verify your email before logging in' });
    }

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

    // ---- Guard: Resend API key must be configured -------------------------
    if (!process.env.RESEND_API_KEY) {
      console.error('ForgotPassword: RESEND_API_KEY environment variable is not configured in .env');
      return res.status(500).json({ msg: 'Email service is not configured on the server. Please contact the admin.' });
    }

    const emailHtml = `
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
    `;

    await sendEmailViaResend({
      to: email,
      subject: '🔑 CollabCode – Password Reset Link',
      html: emailHtml,
    });

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

// =====================================================================
// VERIFY EMAIL – Validate token and set isVerified to true
// =====================================================================
exports.verifyEmail = async (req, res) => {
  const { token } = req.query;

  if (!token) {
    return res.status(400).json({ msg: 'Verification token is required' });
  }

  try {
    const user = await User.findOne({ verifyToken: token });

    if (!user) {
      return res.status(400).json({ msg: 'Invalid or expired verification token.' });
    }

    user.isVerified = true;
    user.verifyToken = null;
    await user.save();

    return res.send(`
      <!DOCTYPE html>
      <html lang="en">
      <head>
        <meta charset="UTF-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <title>Email Verified - CollabCode</title>
        <style>
          body {
            font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif;
            background-color: #1E1E2F;
            color: #fff;
            display: flex;
            justify-content: center;
            align-items: center;
            height: 100vh;
            margin: 0;
          }
          .card {
            background-color: #2D2D44;
            padding: 40px;
            border-radius: 12px;
            text-align: center;
            box-shadow: 0 8px 24px rgba(0, 0, 0, 0.3);
            max-width: 400px;
          }
          h1 {
            color: #2ecc71;
            margin-top: 0;
          }
          p {
            color: #ccc;
            line-height: 1.6;
          }
          .btn {
            display: inline-block;
            margin-top: 24px;
            padding: 12px 24px;
            background-color: #2ecc71;
            color: #fff;
            text-decoration: none;
            border-radius: 6px;
            font-weight: bold;
            transition: background-color 0.2s;
          }
          .btn:hover {
            background-color: #27ae60;
          }
        </style>
      </head>
      <body>
        <div class="card">
          <h1>✓ Email Verified!</h1>
          <p>Your email address has been successfully verified. You can now return to the application and sign in.</p>
          <a href="${process.env.FRONTEND_URL || 'http://localhost:5173'}" class="btn">Go to Login</a>
        </div>
      </body>
      </html>
    `);
  } catch (err) {
    console.error('VerifyEmail Error:', err.message);
    res.status(500).json({ msg: 'Server error verifying email: ' + err.message });
  }
};
