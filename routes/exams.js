const express = require('express');
const { nanoid } = require('nanoid');
const Exam = require('../models/Exam');
const { requireAuth, requireRole } = require('../middleware/auth');
const examinerOnly = requireRole('examiner', 'admin');

const router = express.Router();

function validateQuestions(questions) {
  if (!Array.isArray(questions) || questions.length === 0) return 'At least one question is required.';
  for (const q of questions) {
    if (!q.text || !q.text.trim()) return 'Every question needs text.';
    if (!q.points || q.points < 1) return 'Every question needs at least 1 point.';
    if (q.type === 'mcq') {
      if (!Array.isArray(q.options) || q.options.length < 2) return 'MCQ questions need at least 2 options.';
      if (q.correctIndex === undefined || q.correctIndex === null || q.correctIndex < 0 || q.correctIndex >= q.options.length) {
        return 'MCQ questions need a valid correct answer marked.';
      }
    } else if (q.type !== 'sq') {
      return 'Question type must be "mcq" or "sq".';
    }
  }
  return null;
}

// Create an exam — any authenticated examiner can create their own exams.
router.post('/', requireAuth, examinerOnly, async (req, res) => {
  try {
    const { title, description, durationMinutes, questions, settings } = req.body || {};
    if (!title || !title.trim()) return res.status(400).json({ error: 'Title is required.' });
    const qError = validateQuestions(questions);
    if (qError) return res.status(400).json({ error: qError });

    let accessCode;
    // extremely unlikely to collide, but guard anyway
    for (let i = 0; i < 5; i++) {
      const candidate = nanoid(8);
      if (!(await Exam.findOne({ accessCode: candidate }))) { accessCode = candidate; break; }
    }
    if (!accessCode) return res.status(500).json({ error: 'Could not generate a unique exam code, try again.' });

    const exam = await Exam.create({
      title: title.trim(),
      description: description || '',
      durationMinutes: durationMinutes || 30,
      questions,
      settings: {
        showScore: settings?.showScore !== false,
        showPoints: settings?.showPoints !== false,
        revealAnswers: !!settings?.revealAnswers,
      },
      accessCode,
      createdBy: req.userId,
    });

    res.status(201).json({ exam });
  } catch (err) {
    res.status(500).json({ error: 'Could not create exam.', detail: err.message });
  }
});

// List the current examiner's own exams
router.get('/', requireAuth, examinerOnly, async (req, res) => {
  const exams = await Exam.find({ createdBy: req.userId, archived: false }).sort({ createdAt: -1 });
  res.json({ exams });
});

// Get one of the current examiner's exams, full detail (for editing / grading context)
router.get('/:id', requireAuth, examinerOnly, async (req, res) => {
  const exam = await Exam.findOne({ _id: req.params.id, createdBy: req.userId });
  if (!exam) return res.status(404).json({ error: 'Exam not found.' });
  res.json({ exam });
});

router.put('/:id', requireAuth, examinerOnly, async (req, res) => {
  const exam = await Exam.findOne({ _id: req.params.id, createdBy: req.userId });
  if (!exam) return res.status(404).json({ error: 'Exam not found.' });
  const { title, description, durationMinutes, questions, settings } = req.body || {};
  if (questions) {
    const qError = validateQuestions(questions);
    if (qError) return res.status(400).json({ error: qError });
    exam.questions = questions;
  }
  if (title) exam.title = title.trim();
  if (description !== undefined) exam.description = description;
  if (durationMinutes) exam.durationMinutes = durationMinutes;
  if (settings) {
    exam.settings.showScore = settings.showScore !== false;
    exam.settings.showPoints = settings.showPoints !== false;
    exam.settings.revealAnswers = !!settings.revealAnswers;
  }
  await exam.save();
  res.json({ exam });
});

// Archive (never hard-delete — keeps historical submissions/reports intact)
router.delete('/:id', requireAuth, examinerOnly, async (req, res) => {
  const exam = await Exam.findOne({ _id: req.params.id, createdBy: req.userId });
  if (!exam) return res.status(404).json({ error: 'Exam not found.' });
  exam.archived = true;
  await exam.save();
  res.json({ ok: true });
});

// Fetch an exam for taking, by its access code. Requires a logged-in account
// (candidate or examiner) but not exam ownership. Strips answer keys.
router.get('/public/:code', requireAuth, async (req, res) => {
  const exam = await Exam.findOne({ accessCode: req.params.code, archived: false });
  if (!exam) return res.status(404).json({ error: 'This exam link is invalid or no longer available.' });

  const safeQuestions = exam.questions.map((q) => ({
    id: q._id,
    type: q.type,
    text: q.text,
    points: q.points,
    image: q.image || undefined,
    options: q.type === 'mcq' ? q.options : undefined,
  }));

  res.json({
    id: exam._id,
    title: exam.title,
    description: exam.description,
    durationMinutes: exam.durationMinutes,
    settings: exam.settings,
    questions: safeQuestions,
  });
});

module.exports = router;
