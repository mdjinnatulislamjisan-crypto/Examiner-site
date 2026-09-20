const PDFDocument = require('pdfkit');
const fs = require('fs');
const path = require('path');

// PDFKit's built-in fonts (Helvetica etc.) only cover Latin characters — they
// have no Bengali, Devanagari, Arabic, CJK, etc. glyphs at all. Rendering
// non-Latin text with them doesn't error, it just silently prints garbage
// bytes (mojibake). Fixing that requires embedding a real Unicode font.
//
// Noto Sans Bengali covers both Bengali script AND Basic Latin, so one pair
// of files (Regular + Bold) is enough for reports mixing Bengali and English.
// Place these two files here (see /assets/fonts/README.md for exact download
// steps) — everything below falls back to Helvetica automatically if they're
// missing, so a report without them still generates, just without Bengali
// support restored.
const FONT_DIR = path.join(__dirname, '..', 'assets', 'fonts');
const REGULAR_FONT_FILE = path.join(FONT_DIR, 'NotoSansBengali-Regular.ttf');
const BOLD_FONT_FILE = path.join(FONT_DIR, 'NotoSansBengali-Bold.ttf');

function registerUnicodeFonts(doc) {
  const hasRegular = fs.existsSync(REGULAR_FONT_FILE);
  const hasBold = fs.existsSync(BOLD_FONT_FILE);
  if (hasRegular && hasBold) {
    try {
      doc.registerFont('Body', REGULAR_FONT_FILE);
      doc.registerFont('Body-Bold', BOLD_FONT_FILE);
      return { regular: 'Body', bold: 'Body-Bold', hasUnicode: true };
    } catch (e) {
      // corrupt/invalid font file — fall through to Helvetica below
    }
  }
  return { regular: 'Helvetica', bold: 'Helvetica-Bold', hasUnicode: false };
}

// Embeds a base64 data-URL image (from <input type=file> uploads or the
// signature pad) into the report, fitting it within maxWidth/maxHeight and
// starting a new page first if it wouldn't fit on the current one. Silently
// skips anything that fails to decode rather than breaking the whole report.
function embedDataUrlImage(doc, dataUrl, maxWidth, maxHeight) {
  if (!dataUrl || !dataUrl.startsWith('data:image')) return;
  try {
    const base64 = dataUrl.split(',')[1];
    const buf = Buffer.from(base64, 'base64');
    const bottom = doc.page.height - doc.page.margins.bottom;
    if (doc.y + maxHeight > bottom) doc.addPage();
    doc.image(buf, { fit: [maxWidth, maxHeight] });
    doc.moveDown(0.3);
  } catch (e) {
    // corrupt/unsupported image data — skip it, the rest of the report still renders
  }
}

// Builds the graded report as a PDF and resolves with a Buffer.
// `submission` is a Mongoose Submission doc (already graded).
function buildReportPDF(submission) {
  return new Promise((resolve, reject) => {
    try {
      const doc = new PDFDocument({ size: 'A4', margin: 50 });
      const chunks = [];
      doc.on('data', (c) => chunks.push(c));
      doc.on('end', () => resolve(Buffer.concat(chunks)));
      doc.on('error', reject);

      const { regular, bold } = registerUnicodeFonts(doc);

      const inkColor = '#1B2430';
      const accent = '#8C5F22';
      const soft = '#5B6472';
      const line = '#D9D4C6';

      // Header
      doc.fillColor(inkColor).fontSize(20).font(bold)
        .text('Examination Report', { align: 'left' });
      doc.moveDown(0.2);
      doc.fillColor(soft).fontSize(11).font(regular)
        .text(submission.examTitle || 'Exam', { align: 'left' });
      doc.moveTo(50, doc.y + 10).lineTo(545, doc.y + 10).strokeColor(line).stroke();
      doc.moveDown(1.2);

      // Candidate / meta block
      const metaTop = doc.y;
      doc.fontSize(10.5).fillColor(inkColor).font(bold).text('Candidate', 50, metaTop);
      doc.font(regular).fillColor(soft).text(submission.candidateName || '-', 50, doc.y);
      if (submission.candidateEmail) {
        doc.text(submission.candidateEmail, 50, doc.y);
      }

      doc.font(bold).fillColor(inkColor).text('Submitted', 300, metaTop);
      doc.font(regular).fillColor(soft)
        .text(new Date(submission.submittedAt).toLocaleString(), 300, doc.y);
      if (submission.autoSubmitted) {
        doc.fillColor('#A63D31').text('Auto-submitted (time expired)', 300, doc.y);
      }

      doc.moveDown(1.5);

      // Score summary box
      const boxY = doc.y;
      doc.roundedRect(50, boxY, 495, 60, 6).fillAndStroke('#F5F3ED', line);
      doc.fillColor(inkColor).font(bold).fontSize(12)
        .text('Final Score', 65, boxY + 12);
      doc.fontSize(22).text(`${submission.finalScore} / ${submission.totalMax}`, 65, boxY + 28);

      doc.fontSize(10).font(regular).fillColor(soft)
        .text(`Multiple-choice: ${submission.mcqScore} / ${submission.mcqMax}`, 300, boxY + 14)
        .text(`Short answer: ${submission.sqScore} / ${submission.sqMax}`, 300, boxY + 30);

      doc.y = boxY + 75;
      doc.moveDown(0.5);

      // Per-question breakdown
      doc.fontSize(13).font(bold).fillColor(inkColor).text('Answer Breakdown');
      doc.moveDown(0.3);

      submission.answers.forEach((a, i) => {
        if (doc.y > 700) doc.addPage();
        doc.fontSize(10.5).font(bold).fillColor(inkColor)
          .text(`${i + 1}. ${a.text}`, { width: 495 });
        doc.font(regular).fontSize(10);

        if (a.questionImage) embedDataUrlImage(doc, a.questionImage, 260, 170);

        if (a.type === 'mcq') {
          const yourAns = a.selectedIndex === null || a.selectedIndex === undefined
            ? 'No answer' : (a.options[a.selectedIndex] || '');
          const rightAns = a.options[a.correctIndex] || '';
          doc.fillColor(a.correct ? '#3F7A5C' : '#A63D31')
            .text(`Answer: ${yourAns} ${a.correct ? '(correct)' : '(incorrect — correct answer: ' + rightAns + ')'}`);
          doc.fillColor(soft).text(`Marks: ${a.correct ? a.points : 0} / ${a.points}`);
        } else {
          doc.fillColor(soft).text(`Answer: ${a.answer || (a.answerImage ? '(see attached photo)' : '(left blank)')}`);
          if (a.answerImage) embedDataUrlImage(doc, a.answerImage, 260, 200);
          if (a.referenceAnswer) doc.text(`Model answer: ${a.referenceAnswer}`);
          doc.fillColor(inkColor).font(bold)
            .text(`Marks awarded: ${a.awardedMarks == null ? '-' : a.awardedMarks} / ${a.points}`);
        }
        doc.moveDown(0.6);
      });

      if (submission.examinerComments) {
        if (doc.y > 680) doc.addPage();
        doc.moveDown(0.5);
        doc.fontSize(12).font(bold).fillColor(inkColor).text('Examiner Comments');
        doc.fontSize(10.5).font(regular).fillColor(soft).text(submission.examinerComments, { width: 495 });
      }

      // Signature block
      if (doc.y > 650) doc.addPage();
      doc.moveDown(2);
      const sigY = doc.y;
      doc.moveTo(50, sigY).lineTo(230, sigY).strokeColor(line).stroke();

      // If a drawn signature (data URL PNG) was captured, embed it above the line.
      if (submission.examinerSignature && submission.examinerSignature.startsWith('data:image')) {
        try {
          const base64 = submission.examinerSignature.split(',')[1];
          const imgBuf = Buffer.from(base64, 'base64');
          doc.image(imgBuf, 50, sigY - 45, { fit: [160, 40] });
        } catch (e) {
          // fall through to typed name if the image can't be decoded
        }
      } else if (submission.examinerSignature) {
        doc.font(regular).fontSize(16).fillColor(accent)
          .text(submission.examinerSignature, 50, sigY - 26);
      }

      doc.fontSize(9.5).font(regular).fillColor(soft)
        .text('Examiner signature', 50, sigY + 5);
      doc.fontSize(10).font(bold).fillColor(inkColor)
        .text(submission.examinerName || '', 50, sigY + 18);
      doc.fontSize(9).font(regular).fillColor(soft)
        .text(submission.gradedAt ? new Date(submission.gradedAt).toLocaleString() : '', 50, sigY + 32);

      doc.end();
    } catch (err) {
      reject(err);
    }
  });
}

module.exports = { buildReportPDF };
