const User = require('../models/User');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const mongoose = require('mongoose');

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
