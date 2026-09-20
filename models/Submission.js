const mongoose = require('mongoose');

const AnswerLogSchema = new mongoose.Schema(
  {
    questionId: { type: mongoose.Schema.Types.ObjectId, required: true },
    type: { type: String, enum: ['mcq', 'sq'], required: true },
    text: String,
    points: Number,
    questionImage: { type: String, default: '' }, // copy of the question's image, if any, for the report
    // mcq
    options: [String],
    selectedIndex: { type: Number, default: null },
    correctIndex: Number,
    correct: Boolean,
    // sq
    answer: String,
    answerImage: { type: String, default: '' }, // candidate-attached photo (e.g. a worked-out math/physics/chem answer)
    referenceAnswer: String,
    awardedMarks: { type: Number, default: null },
  },
  { _id: false }
);

const SubmissionSchema = new mongoose.Schema(
  {
    exam: { type: mongoose.Schema.Types.ObjectId, ref: 'Exam', required: true },
    examTitle: String,
    candidate: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    candidateName: { type: String, required: true },
    candidateEmail: { type: String, default: '' },
    submittedAt: { type: Date, default: Date.now },
    autoSubmitted: { type: Boolean, default: false },

    answers: { type: [AnswerLogSchema], default: [] },

    mcqScore: { type: Number, default: 0 },
    mcqMax: { type: Number, default: 0 },
    sqScore: { type: Number, default: 0 },
    sqMax: { type: Number, default: 0 },
    totalMax: { type: Number, default: 0 },
    finalScore: { type: Number, default: 0 },

    graded: { type: Boolean, default: false },
    gradedAt: { type: Date },
    gradedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    examinerName: { type: String, default: '' },
    examinerSignature: { type: String, default: '' }, // data URL (image) or typed signature text
    examinerComments: { type: String, default: '' },

    reportEmailSent: { type: Boolean, default: false },
    reportEmailError: { type: String, default: '' },
  },
  { timestamps: true }
);

module.exports = mongoose.model('Submission', SubmissionSchema);
