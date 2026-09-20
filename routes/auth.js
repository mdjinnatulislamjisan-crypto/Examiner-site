const express = require('express');
const jwt = require('jsonwebtoken');
const User = require('../models/User');
const { requireAuth } = require('../middleware/auth');
const { sendMail } = require('../utils/email');

const router = express.Router();

function signToken(user) {
  return jwt.sign({ id: user._id, role: user.role }, process.env.JWT_SECRET, { expiresIn: '30d' });
}

function baseUrl() {
  return (process.env.PUBLIC_BASE_URL || 'http://localhost:5000').replace(/\/$/, '');
}

function escapeHtml(s) {
  return String(s || '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

async function sendVerificationEmail(user, token) {
  const link = `${baseUrl()}/verify-email.html?token=${token}`;
  await sendMail({
    to: user.email,
    subject: 'Verify your email — Examiner',
    html: `<p>Hi ${escapeHtml(user.name)},</p>
           <p>Thanks for creating an account. Please confirm your email address to activate it:</p>
           <p><a href="${link}">${link}</a></p>
           <p>This link expires in 24 hours. If you didn't create this account, you can ignore this email.</p>`,
  });
}

async function sendResetEmail(user, token) {
  const link = `${baseUrl()}/reset-password.html?token=${token}`;
  await sendMail({
    to: user.email,
    subject: 'Reset your password — Examiner',
    html: `<p>Hi ${escapeHtml(user.name)},</p>
           <p>We received a request to reset your password. Click below to choose a new one:</p>
           <p><a href="${link}">${link}</a></p>
           <p>This link expires in 1 hour. If you didn't request this, you can safely ignore this email —
           your password will stay the same.</p>`,
  });
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
    const token = user.generateVerifyToken();
    await user.save();

    let emailWarning = null;
    try {
      await sendVerificationEmail(user, token);
    } catch (err) {
      emailWarning = 'Account created, but the verification email could not be sent. Use "Resend verification email" on the login page to try again.';
    }

    res.status(201).json({
      message: emailWarning || `We've sent a verification link to ${user.email}. Please verify your email before logging in.`,
      emailWarning: !!emailWarning,
      email: user.email,
    });
  } catch (err) {
    res.status(500).json({ error: 'Could not create account.', detail: err.message });
  }
});

router.post('/verify-email', async (req, res) => {
  try {
    const { token } = req.body || {};
    if (!token) return res.status(400).json({ error: 'Missing verification token.' });
    const user = await User.findOne({ verifyToken: token, verifyTokenExpires: { $gt: new Date() } });
    if (!user) {
      return res.status(400).json({ error: 'This verification link is invalid or has expired. Request a new one from the login page.' });
    }
    user.emailVerified = true;
    user.verifyToken = null;
    user.verifyTokenExpires = null;
    await user.save();
    const jwtToken = signToken(user);
    res.json({ token: jwtToken, user: user.toSafeJSON() });
  } catch (err) {
    res.status(500).json({ error: 'Could not verify email.', detail: err.message });
  }
});

router.post('/resend-verification', async (req, res) => {
  const { email } = req.body || {};
  // Always respond with the same generic message, whether or not the account
  // exists or is already verified — avoids leaking which emails are registered.
  const generic = { message: 'If that email has an unverified account, we\'ve sent a new verification link.' };
  try {
    if (!email) return res.json(generic);
    const user = await User.findOne({ email: email.toLowerCase().trim() });
    if (user && !user.emailVerified) {
      const token = user.generateVerifyToken();
      await user.save();
      await sendVerificationEmail(user, token).catch(() => {});
    }
    res.json(generic);
  } catch (err) {
    res.json(generic);
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
    if (!user.emailVerified) {
      return res.status(403).json({ error: 'Please verify your email before logging in.', needsVerification: true });
    }
    const token = signToken(user);
    res.json({ token, user: user.toSafeJSON() });
  } catch (err) {
    res.status(500).json({ error: 'Login failed.', detail: err.message });
  }
});

router.post('/forgot-password', async (req, res) => {
  const { email } = req.body || {};
  // Same generic-response pattern as resend-verification, for the same reason.
  const generic = { message: 'If an account exists for that email, we\'ve sent password reset instructions.' };
  try {
    if (!email) return res.json(generic);
    const user = await User.findOne({ email: email.toLowerCase().trim() });
    if (user) {
      const token = user.generateResetToken();
      await user.save();
      await sendResetEmail(user, token).catch(() => {});
    }
    res.json(generic);
  } catch (err) {
    res.json(generic);
  }
});

router.post('/reset-password', async (req, res) => {
  try {
    const { token, password } = req.body || {};
    if (!token || !password) return res.status(400).json({ error: 'Missing token or new password.' });
    if (password.length < 8) return res.status(400).json({ error: 'Password must be at least 8 characters.' });
    const user = await User.findOne({ resetToken: token, resetTokenExpires: { $gt: new Date() } });
    if (!user) {
      return res.status(400).json({ error: 'This reset link is invalid or has expired. Request a new one.' });
    }
    await user.setPassword(password);
    user.resetToken = null;
    user.resetTokenExpires = null;
    await user.save();
    res.json({ message: 'Password updated. You can now log in.' });
  } catch (err) {
    res.status(500).json({ error: 'Could not reset password.', detail: err.message });
  }
});

router.get('/me', requireAuth, async (req, res) => {
  const user = await User.findById(req.userId);
  if (!user) return res.status(404).json({ error: 'User not found.' });
  res.json({ user: user.toSafeJSON() });
});

module.exports = router;
