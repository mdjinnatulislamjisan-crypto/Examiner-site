const mongoose = require('mongoose');

const QuestionSchema = new mongoose.Schema(
  {
    type: { type: String, enum: ['mcq', 'sq'], required: true },
    text: { type: String, required: true },
    points: { type: Number, required: true, min: 1, default: 1 },
    image: { type: String, default: '' }, // optional data URL — diagrams, equations, chemical structures etc.
    // mcq only
    options: [{ type: String }],
    correctIndex: { type: Number },
    // sq only
    referenceAnswer: { type: String },
  },
  { _id: true }
);

const ExamSchema = new mongoose.Schema(
  {
    title: { type: String, required: true, trim: true },
    description: { type: String, default: '' },
    durationMinutes: { type: Number, required: true, min: 1, default: 30 },
    questions: { type: [QuestionSchema], default: [] },
    settings: {
      showScore: { type: Boolean, default: true },
      showPoints: { type: Boolean, default: true },
      revealAnswers: { type: Boolean, default: false },
    },
    accessCode: { type: String, required: true, unique: true, index: true },
    createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    archived: { type: Boolean, default: false },
  },
  { timestamps: true }
);

module.exports = mongoose.model('Exam', ExamSchema);
