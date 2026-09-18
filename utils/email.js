// Thin wrapper around Mailjet's Send API v3.1 (https://dev.mailjet.com/email/guides/send-api-v31/).
//
// Auth is HTTP Basic: username = API Key, password = Secret Key (both from
// your Mailjet account's API Key Management page). No SDK needed — it's a
// plain JSON POST.
//
// If sending fails, callers should treat it as non-fatal: the submission
// and grade are already saved in MongoDB, so a flaky email never loses data.

async function sendMail({ to, subject, html, attachments }) {
  const apiKey = process.env.MAILJET_API_KEY;
  const apiSecret = process.env.MAILJET_API_SECRET;
  const fromEmail = process.env.MAILJET_FROM_EMAIL;
  const fromName = process.env.MAILJET_FROM_NAME || 'Examiner Platform';

  if (!apiKey || !apiSecret || !fromEmail) {
    throw new Error('Mailjet is not configured (MAILJET_API_KEY / MAILJET_API_SECRET / MAILJET_FROM_EMAIL missing).');
  }

  const message = {
    From: { Email: fromEmail, Name: fromName },
    To: [{ Email: to }],
    Subject: subject,
    HTMLPart: html,
  };

  if (attachments && attachments.length) {
    message.Attachments = attachments.map((a) => ({
      ContentType: a.contentType || 'application/pdf',
      Filename: a.filename,
      Base64Content: a.content.toString('base64'),
    }));
  }

  const res = await fetch('https://api.mailjet.com/v3.1/send', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: 'Basic ' + Buffer.from(`${apiKey}:${apiSecret}`).toString('base64'),
    },
    body: JSON.stringify({ Messages: [message] }),
  });

  const data = await res.json().catch(() => ({}));

  if (!res.ok) {
    const detail = data?.ErrorMessage || data?.Messages?.[0]?.Errors?.map((e) => e.ErrorMessage).join('; ') || res.statusText;
    throw new Error(`Mailjet request failed (${res.status}): ${detail}`);
  }

  // A 200 from Mailjet can still contain a per-message "error" status.
  const status = data?.Messages?.[0]?.Status;
  if (status && status !== 'success') {
    const detail = data.Messages[0].Errors?.map((e) => e.ErrorMessage).join('; ') || status;
    throw new Error(`Mailjet did not send the message: ${detail}`);
  }

  return data;
}

module.exports = { sendMail };
