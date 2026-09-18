const PDFDocument = require('pdfkit');

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

      const inkColor = '#1B2430';
      const accent = '#8C5F22';
      const soft = '#5B6472';
      const line = '#D9D4C6';

      // Header
      doc.fillColor(inkColor).fontSize(20).font('Helvetica-Bold')
        .text('Examination Report', { align: 'left' });
      doc.moveDown(0.2);
      doc.fillColor(soft).fontSize(11).font('Helvetica')
        .text(submission.examTitle || 'Exam', { align: 'left' });
      doc.moveTo(50, doc.y + 10).lineTo(545, doc.y + 10).strokeColor(line).stroke();
      doc.moveDown(1.2);

      // Candidate / meta block
      const metaTop = doc.y;
      doc.fontSize(10.5).fillColor(inkColor).font('Helvetica-Bold').text('Candidate', 50, metaTop);
      doc.font('Helvetica').fillColor(soft).text(submission.candidateName || '-', 50, doc.y);
      if (submission.candidateEmail) {
        doc.text(submission.candidateEmail, 50, doc.y);
      }

      doc.font('Helvetica-Bold').fillColor(inkColor).text('Submitted', 300, metaTop);
      doc.font('Helvetica').fillColor(soft)
        .text(new Date(submission.submittedAt).toLocaleString(), 300, doc.y);
      if (submission.autoSubmitted) {
        doc.fillColor('#A63D31').text('Auto-submitted (time expired)', 300, doc.y);
      }

      doc.moveDown(1.5);

      // Score summary box
      const boxY = doc.y;
      doc.roundedRect(50, boxY, 495, 60, 6).fillAndStroke('#F5F3ED', line);
      doc.fillColor(inkColor).font('Helvetica-Bold').fontSize(12)
        .text('Final Score', 65, boxY + 12);
      doc.fontSize(22).text(`${submission.finalScore} / ${submission.totalMax}`, 65, boxY + 28);

      doc.fontSize(10).font('Helvetica').fillColor(soft)
        .text(`Multiple-choice: ${submission.mcqScore} / ${submission.mcqMax}`, 300, boxY + 14)
        .text(`Short answer: ${submission.sqScore} / ${submission.sqMax}`, 300, boxY + 30);

      doc.y = boxY + 75;
      doc.moveDown(0.5);

      // Per-question breakdown
      doc.fontSize(13).font('Helvetica-Bold').fillColor(inkColor).text('Answer Breakdown');
      doc.moveDown(0.3);

      submission.answers.forEach((a, i) => {
        if (doc.y > 700) doc.addPage();
        doc.fontSize(10.5).font('Helvetica-Bold').fillColor(inkColor)
          .text(`${i + 1}. ${a.text}`, { width: 495 });
        doc.font('Helvetica').fontSize(10);

        if (a.type === 'mcq') {
          const yourAns = a.selectedIndex === null || a.selectedIndex === undefined
            ? 'No answer' : (a.options[a.selectedIndex] || '');
          const rightAns = a.options[a.correctIndex] || '';
          doc.fillColor(a.correct ? '#3F7A5C' : '#A63D31')
            .text(`Answer: ${yourAns} ${a.correct ? '(correct)' : '(incorrect — correct answer: ' + rightAns + ')'}`);
          doc.fillColor(soft).text(`Marks: ${a.correct ? a.points : 0} / ${a.points}`);
        } else {
          doc.fillColor(soft).text(`Answer: ${a.answer || '(left blank)'}`);
          if (a.referenceAnswer) doc.text(`Model answer: ${a.referenceAnswer}`);
          doc.fillColor(inkColor).font('Helvetica-Bold')
            .text(`Marks awarded: ${a.awardedMarks == null ? '-' : a.awardedMarks} / ${a.points}`);
        }
        doc.moveDown(0.6);
      });

      if (submission.examinerComments) {
        if (doc.y > 680) doc.addPage();
        doc.moveDown(0.5);
        doc.fontSize(12).font('Helvetica-Bold').fillColor(inkColor).text('Examiner Comments');
        doc.fontSize(10.5).font('Helvetica').fillColor(soft).text(submission.examinerComments, { width: 495 });
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
        doc.font('Helvetica-Oblique').fontSize(16).fillColor(accent)
          .text(submission.examinerSignature, 50, sigY - 26);
      }

      doc.fontSize(9.5).font('Helvetica').fillColor(soft)
        .text('Examiner signature', 50, sigY + 5);
      doc.fontSize(10).font('Helvetica-Bold').fillColor(inkColor)
        .text(submission.examinerName || '', 50, sigY + 18);
      doc.fontSize(9).font('Helvetica').fillColor(soft)
        .text(submission.gradedAt ? new Date(submission.gradedAt).toLocaleString() : '', 50, sigY + 32);

      doc.end();
    } catch (err) {
      reject(err);
    }
  });
}

module.exports = { buildReportPDF };
