const express = require('express');
const Exam = require('../models/Exam');
const Submission = require('../models/Submission');
const User = require('../models/User');
const { requireAuth, requireRole } = require('../middleware/auth');
const { buildReportPDF } = require('../utils/pdfReport');
const { sendMail } = require('../utils/email');

const router = express.Router();
const examinerOnly = requireRole('examiner', 'admin');

// A logged-in candidate submits their completed exam by access code.
router.post('/:code/submit', requireAuth, async (req, res) => {
  try {
    const exam = await Exam.findOne({ accessCode: req.params.code, archived: false });
    if (!exam) return res.status(404).json({ error: 'This exam link is invalid or no longer available.' });

    const candidateUser = await User.findById(req.userId);
    if (!candidateUser) return res.status(401).json({ error: 'Please log in again.' });

    const { answers, answerImages, autoSubmitted } = req.body || {};
    const candidateName = candidateUser.name;
    const candidateEmail = candidateUser.email;

    const already = await Submission.findOne({ exam: exam._id, candidate: candidateUser._id });
    if (already && already.graded) {
      return res.status(409).json({ error: 'You have already submitted and been graded for this exam.' });
    }

    let mcqScore = 0, mcqMax = 0, sqMax = 0, totalMax = 0;
    const answerLog = exam.questions.map((q) => {
      totalMax += q.points;
      const submitted = answers ? answers[String(q._id)] : undefined;
      if (q.type === 'mcq') {
        mcqMax += q.points;
        const sel = typeof submitted === 'number' ? submitted : null;
        const correct = sel !== null && sel === q.correctIndex;
        if (correct) mcqScore += q.points;
        return {
          questionId: q._id, type: 'mcq', text: q.text, points: q.points, questionImage: q.image || '',
          options: q.options, selectedIndex: sel, correctIndex: q.correctIndex, correct,
        };
      } else {
        sqMax += q.points;
        const img = answerImages ? answerImages[String(q._id)] : undefined;
        return {
          questionId: q._id, type: 'sq', text: q.text, points: q.points, questionImage: q.image || '',
          answer: typeof submitted === 'string' ? submitted : '',
          answerImage: typeof img === 'string' && img.startsWith('data:image') ? img : '',
          referenceAnswer: q.referenceAnswer || '',
          awardedMarks: null,
        };
      }
    });

    const data = {
      exam: exam._id,
      examTitle: exam.title,
      candidate: candidateUser._id,
      candidateName,
      candidateEmail,
      autoSubmitted: !!autoSubmitted,
      answers: answerLog,
      mcqScore, mcqMax, sqMax, totalMax,
      sqScore: 0,
      finalScore: mcqScore,
      graded: sqMax === 0,
    };

    const submission = already
      ? Object.assign(already, data, { submittedAt: new Date() })
      : new Submission(data);
    await submission.save();

    res.status(201).json({
      submissionId: submission._id,
      mcqScore, mcqMax, totalMax,
      showScore: exam.settings.showScore,
      revealAnswers: exam.settings.revealAnswers,
      answers: exam.settings.revealAnswers ? answerLog : undefined,
      pendingReview: sqMax > 0,
    });
  } catch (err) {
    res.status(500).json({ error: 'Could not save your submission. Please try again.', detail: err.message });
  }
});

// List submissions across all of the current examiner's exams.
router.get('/', requireAuth, examinerOnly, async (req, res) => {
  const exams = await Exam.find({ createdBy: req.userId }).select('_id title');
  const examIds = exams.map((e) => e._id);
  const submissions = await Submission.find({ exam: { $in: examIds } })
    .sort({ createdAt: -1 })
    .select('-answers');
  res.json({ submissions });
});

// A candidate's own submission history, across every exam they've taken.
router.get('/mine', requireAuth, async (req, res) => {
  const submissions = await Submission.find({ candidate: req.userId })
    .sort({ createdAt: -1 })
    .select('-answers');
  res.json({ submissions });
});

// A submission can be opened by the examiner who owns the exam, or by the
// candidate who submitted it (read-only for the candidate; grading is
// examiner-only, enforced separately below).
async function loadAccessibleSubmission(req) {
  const submission = await Submission.findById(req.params.id);
  if (!submission) return null;
  if (String(submission.candidate) === String(req.userId)) return { submission, asExaminer: false };
  const exam = await Exam.findOne({ _id: submission.exam, createdBy: req.userId });
  if (!exam) return null;
  return { submission, exam, asExaminer: true };
}

// Only the owning examiner may load a submission through the grading flow.
async function loadOwnedSubmission(req) {
  const found = await loadAccessibleSubmission(req);
  if (!found || !found.asExaminer) return null;
  return found;
}

router.get('/:id', requireAuth, async (req, res) => {
  const found = await loadAccessibleSubmission(req);
  if (!found) return res.status(404).json({ error: 'Submission not found.' });
  res.json({ submission: found.submission });
});

// Grade short-answer questions, finalize score, generate the signed PDF report,
// and (optionally) email it to the candidate via Mailjet. Examiners only.
router.put('/:id/grade', requireAuth, examinerOnly, async (req, res) => {
  const found = await loadOwnedSubmission(req);
  if (!found) return res.status(404).json({ error: 'Submission not found.' });
  const { submission } = found;

  const { marks, examinerSignature, examinerComments, sendEmail } = req.body || {};
  const examiner = await User.findById(req.userId);

  let sqScore = 0;
  submission.answers = submission.answers.map((a) => {
    if (a.type !== 'sq') return a;
    const raw = marks ? marks[String(a.questionId)] : undefined;
    let awarded = typeof raw === 'number' ? raw : parseFloat(raw);
    if (!Number.isFinite(awarded)) awarded = 0;
    awarded = Math.max(0, Math.min(a.points, awarded));
    sqScore += awarded;
    a.awardedMarks = awarded;
    return a;
  });

  submission.sqScore = sqScore;
  submission.finalScore = submission.mcqScore + sqScore;
  submission.graded = true;
  submission.gradedAt = new Date();
  submission.gradedBy = req.userId;
  submission.examinerName = examiner ? examiner.name : '';
  submission.examinerSignature = examinerSignature || '';
  submission.examinerComments = examinerComments || '';
  submission.reportEmailError = '';

  await submission.save();

  let emailResult = null;
  if (sendEmail && submission.candidateEmail) {
    try {
      const pdfBuffer = await buildReportPDF(submission);
      await sendMail({
        to: submission.candidateEmail,
        subject: `Your result: ${submission.examTitle}`,
        html: `<p>Hi ${escapeHtml(submission.candidateName)},</p>
               <p>Your exam <strong>${escapeHtml(submission.examTitle)}</strong> has been graded.
               Final score: <strong>${submission.finalScore} / ${submission.totalMax}</strong>.</p>
               <p>Your full report is attached, and also available any time by logging in.</p>`,
        attachments: [{ filename: 'exam-report.pdf', content: pdfBuffer }],
      });
      submission.reportEmailSent = true;
      await submission.save();
      emailResult = 'sent';
    } catch (err) {
      submission.reportEmailError = err.message;
      await submission.save();
      emailResult = 'failed';
    }
  }

  res.json({ submission, emailResult });
});

// Download the signed PDF report for a graded submission — the owning
// examiner or the candidate themself can both do this.
router.get('/:id/report.pdf', requireAuth, async (req, res) => {
  const found = await loadAccessibleSubmission(req);
  if (!found) return res.status(404).json({ error: 'Submission not found.' });
  const { submission } = found;
  if (!submission.graded) return res.status(400).json({ error: 'This submission has not been graded yet.' });

  try {
    const pdfBuffer = await buildReportPDF(submission);
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `inline; filename="report_${submission.candidateName.replace(/[^a-z0-9]+/gi, '_')}.pdf"`);
    res.send(pdfBuffer);
  } catch (err) {
    res.status(500).json({ error: 'Could not generate the PDF report.', detail: err.message });
  }
});

function escapeHtml(s) {
  return String(s || '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

module.exports = router;
