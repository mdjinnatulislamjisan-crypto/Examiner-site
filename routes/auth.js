const express = require('express');
const jwt = require('jsonwebtoken');
const User = require('../models/User');
const { requireAuth } = require('../middleware/auth');

const router = express.Router();

function signToken(user) {
  return jwt.sign({ id: user._id, role: user.role }, process.env.JWT_SECRET, { expiresIn: '30d' });
}

router.post('/register', async (req, res) => {
  try {
    const { name, email, password, role } = req.body || {};
    if (!name || !email || !password) {
      return res.status(400).json({ error: 'Name, email and password are all required.' });
    }
    if (password.length < 8) {
      return res.status(400).json({ error: 'Password must be at least 8 characters.' });
    }
    const cleanRole = role === 'examiner' ? 'examiner' : 'candidate'; // never allow self-registering as admin
    const existing = await User.findOne({ email: email.toLowerCase().trim() });
    if (existing) {
      return res.status(409).json({ error: 'An account with that email already exists.' });
    }
    const user = new User({ name: name.trim(), email: email.toLowerCase().trim(), role: cleanRole });
    await user.setPassword(password);
    await user.save();
    const token = signToken(user);
    res.status(201).json({ token, user: user.toSafeJSON() });
  } catch (err) {
    res.status(500).json({ error: 'Could not create account.', detail: err.message });
  }
});

router.post('/login', async (req, res) => {
  try {
    const { email, password } = req.body || {};
    if (!email || !password) return res.status(400).json({ error: 'Email and password are required.' });
    const user = await User.findOne({ email: email.toLowerCase().trim() });
    if (!user) return res.status(401).json({ error: 'Invalid email or password.' });
    const ok = await user.checkPassword(password);
    if (!ok) return res.status(401).json({ error: 'Invalid email or password.' });
    const token = signToken(user);
    res.json({ token, user: user.toSafeJSON() });
  } catch (err) {
    res.status(500).json({ error: 'Login failed.', detail: err.message });
  }
});

router.get('/me', requireAuth, async (req, res) => {
  const user = await User.findById(req.userId);
  if (!user) return res.status(404).json({ error: 'User not found.' });
  res.json({ user: user.toSafeJSON() });
});

module.exports = router;
