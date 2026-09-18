require('dotenv').config();
const path = require('path');
const express = require('express');
const cors = require('cors');
const rateLimit = require('express-rate-limit');
const connectDB = require('./config/db');

const authRoutes = require('./routes/auth');
const examRoutes = require('./routes/exams');
const submissionRoutes = require('./routes/submissions');

const app = express();

app.use(cors());
app.use(express.json({ limit: '2mb' })); // signatures are small base64 images, keep a sane cap

// Basic protection on auth endpoints against brute-force attempts.
const authLimiter = rateLimit({ windowMs: 15 * 60 * 1000, max: 50 });
app.use('/api/auth', authLimiter);

app.use('/api/auth', authRoutes);
app.use('/api/exams', examRoutes);
app.use('/api/submissions', submissionRoutes);

app.get('/api/health', (req, res) => res.json({ ok: true }));

app.use(express.static(path.join(__dirname, 'public')));
app.get('*', (req, res) => {
  if (req.path.startsWith('/api/')) return res.status(404).json({ error: 'Not found.' });
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

const PORT = process.env.PORT || 5000;

connectDB().then(() => {
  app.listen(PORT, () => console.log(`Exam platform listening on port ${PORT}`));
});
