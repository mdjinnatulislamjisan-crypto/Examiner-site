# Examiner — Online Exam Platform

Accounts for examiners, MongoDB-backed persistence (nothing is lost when your PC
is off), exam creation by any examiner, timed exam-taking links for candidates,
manual grading of short answers with a drawn/typed e-signature, signed PDF
reports, and email delivery via Mailjet.

## What's in here

```
exam-platform/
  server.js              Express app entry point
  config/db.js            MongoDB connection
  models/                 User, Exam, Submission (Mongoose schemas)
  routes/                 auth.js, exams.js, submissions.js (the API)
  middleware/auth.js       JWT login check
  utils/email.js           Mailjet sender
  utils/pdfReport.js       Signed PDF report generator (pdfkit)
  public/                  Front end: login, register, dashboard, build-exam,
                            take-exam, grade — plain HTML/CSS/JS, no build step
```

Everything a candidate submits is written straight to MongoDB Atlas, so it
survives your computer being off, restarts, and redeploys. Exams are never
hard-deleted — "Archive" just stops new submissions; history stays intact.

---

## 1. Get the code into VS Code

1. Install [VS Code](https://code.visualstudio.com/) and [Node.js 18+](https://nodejs.org/).
2. Unzip the project folder I gave you, then in VS Code: **File → Open Folder** → select `exam-platform`.
3. Open a terminal in VS Code (**Terminal → New Terminal**) and run:
   ```
   npm install
   ```

## 2. Create your MongoDB Atlas database (free tier)

1. Go to [mongodb.com/cloud/atlas](https://www.mongodb.com/cloud/atlas) and sign up.
2. Create a free **M0** cluster (any region close to you).
3. **Database Access** → Add a database user (username + password — save these).
4. **Network Access** → Add IP Address → **Allow access from anywhere** (`0.0.0.0/0`)
   so Render can reach it.
5. **Database → Connect → Drivers** → copy the connection string. It looks like:
   ```
   mongodb+srv://<user>:<password>@cluster0.xxxxx.mongodb.net/?retryWrites=true&w=majority
   ```
   Add a database name before the `?`, e.g. `.../examplatform?retryWrites=true&w=majority`.

## 3. Set up Mailjet (for sending signed reports by email)

1. Sign up at [mailjet.com](https://www.mailjet.com) (free tier: 6,000 emails/month, 200/day, no card).
2. **Account Settings → Sender addresses & domains** → add and verify the
   email address (or domain) you'll send from. Mailjet won't send on behalf
   of an unverified sender.
3. **Account Settings → API Key Management** → copy your **API Key** and
   **Secret Key**.
4. That's it — `utils/email.js` calls Mailjet's documented Send API v3.1
   directly (`POST https://api.mailjet.com/v3.1/send`), so nothing needs
   adjusting unless your account is on Mailjet's separate EU/US
   infrastructure split (their dashboard will tell you if so; if it does,
   change the URL in `utils/email.js` to match).
5. Email sending failures never lose data — the grade and PDF are already saved;
   only the email step can fail, and the examiner sees a clear "email failed,
   download the PDF instead" message.

## 4. Add the Bengali font (needed for correct PDF reports)

If any of your exams use Bengali (or any non-Latin script), the PDF report
generator needs a real Unicode font — PDFKit's built-in fonts only support
Latin characters and will render Bengali as garbled text otherwise.

Full step-by-step instructions are in **`assets/fonts/README.md`** — in
short: download Noto Sans Bengali from Google Fonts, and drop the Regular
and Bold `.ttf` files into `assets/fonts/`. If your exams are English-only,
you can skip this — reports still generate fine without it.

## 5. Configure environment variables

1. In the project folder, copy `.env.example` to `.env`.
2. Fill in:
   - `MONGODB_URI` — from step 2.
   - `JWT_SECRET` — generate one:
     ```
     node -e "console.log(require('crypto').randomBytes(48).toString('hex'))"
     ```
   - `MAILJET_API_KEY`, `MAILJET_API_SECRET`, `MAILJET_FROM_EMAIL`, `MAILJET_FROM_NAME` — from step 3.
   - `PUBLIC_BASE_URL` — leave as `http://localhost:5000` for now; you'll set
     the real one after deploying.

## 6. Run it locally

```
npm run dev
```
Open `http://localhost:5000`. Register an examiner account, build an exam,
copy its candidate link, open that link in a private/incognito window to try
taking it, then go to **Grading** to mark it and generate the PDF report.

---

## 7. Push to GitHub

In the VS Code terminal:
```
git init
git add .
git commit -m "Initial exam platform"
```
Create a new empty repository on [github.com/new](https://github.com/new)
(don't add a README there), then:
```
git remote add origin https://github.com/<your-username>/<your-repo>.git
git branch -M main
git push -u origin main
```
(VS Code's built-in **Source Control** panel can do all of this with buttons
instead of the commands above, if you prefer.)

Your `.env` file is excluded by `.gitignore` — your secrets never get pushed.

## 8. Deploy on Render (so it stays online while your PC is off)

1. Sign up at [render.com](https://render.com) and connect your GitHub account.
2. **New → Web Service** → pick your `exam-platform` repo.
3. Settings:
   - **Build Command:** `npm install`
   - **Start Command:** `npm start`
   - **Instance type:** Free is fine to start.
4. Under **Environment**, add the same variables from your `.env`:
   `MONGODB_URI`, `JWT_SECRET`, `MAILJET_API_KEY`, `MAILJET_API_SECRET`,
   `MAILJET_FROM_EMAIL`, `MAILJET_FROM_NAME`, and set `PUBLIC_BASE_URL` to the Render URL you're given
   (e.g. `https://exam-platform.onrender.com`) once the first deploy finishes.
   Do **not** set `PORT` — Render sets it for you automatically.
5. Click **Create Web Service**. Render builds and deploys automatically on
   every push to `main` from then on.
6. On Render's free tier the service can sleep after inactivity and take ~30s
   to wake on the next visit — normal for the free plan, and it doesn't affect
   any stored data.

Your site is now live at your Render URL, independent of your own computer.

---

- **Photos on questions and answers** — on the Build Exam page, any question
  (MCQ or short-answer) can have a photo attached — essential for math,
  physics, chemistry and biology questions with diagrams, equations or
  structures. Candidates can likewise attach a photo of their own worked-out
  answer on short-answer questions (e.g. a hand-written solution). Images are
  compressed client-side before upload to keep exam documents small, and both
  the question image and the candidate's answer photo are embedded directly
  into the signed PDF report.
- **Two ways to build an exam fast** — besides typing questions in by hand,
  the Build Exam page can **import a JSON file** (a structured export from
  another tool) or **parse pasted plain text**: paste numbered questions
  (Bengali or English) and it automatically detects which ones are
  multiple-choice (by spotting lettered options like ক)/খ)/a)/b)) versus
  short-answer, and picks up an explicit "Answer: খ" / "Ans: B" line if one is
  present. Either way, the result lands in the normal editable question list
  for review before saving — nothing is created automatically without you
  seeing it first.

## How the pieces fit together

- **Two kinds of accounts** — at `/register.html`, a person picks **Examiner**
  or **Candidate**. Sessions are JWTs stored in the browser and sent as
  `Authorization: Bearer <token>` on every API call; the JWT carries the
  role, and the API re-checks the role against the database on every
  examiner-only request (`middleware/auth.js` → `requireRole`), so a role
  can never be spoofed from the browser.
- **Email verification is required before logging in** — registering sends
  a verification link (via Mailjet) instead of logging the person in right
  away. `/verify-email.html` confirms the link and then logs them in
  automatically. If a link is lost or expired, both the login page (when it
  detects an unverified account) and the verify page itself offer a
  **Resend verification email** option.
- **Forgot password** — `/forgot-password.html` emails a reset link (valid
  1 hour) to any account with that address; `/reset-password.html` sets the
  new password. Both always show the same generic confirmation message
  whether or not the email is registered, so no one can use it to discover
  which emails have accounts.
- **Safe, permanent storage** — every exam and every submission is a document
  in MongoDB Atlas (a managed, backed-up cloud database), not local storage or
  a file on your PC. Exams are archived, never deleted, so history is kept.
- **Any examiner can create exams** — `/build-exam.html` is available to any
  logged-in examiner account; each examiner only sees and manages their own
  exams and submissions.
- **Candidates log in to take exams** — `/take-exam.html?code=XXXXXXXX` is the
  shareable link for each exam. A candidate without an account is sent to
  `/login.html` (with a link to register) and returned straight to the exam
  afterward. Their name and email come from their account, not free text, so
  every submission is reliably tied to a real person. `/my-results.html` is
  their personal dashboard — every exam they've taken, graded or pending, with
  a **Download report** link once it's graded.
- **Grading & reports** — `/grade.html` (examiners only) lists every
  submission (auto-graded MCQs instantly, short answers queued for you).
  Opening one lets you award marks, add comments, draw or type your
  signature, and finalize — this generates a professional PDF
  (`utils/pdfReport.js`) with the full answer breakdown, marks, and your
  signature. Both the examiner and the candidate who took that exam can
  download the PDF; no one else can.

## Extending it later

- Add more roles (e.g. an "admin" who can see all examiners' exams) — the
  `role` field on `User` is already there for this.
- Add exam start/end date windows, or a per-candidate one-time-use link,
  by adding fields to `Exam`/`Submission` and checking them in
  `routes/exams.js` / `routes/submissions.js`.
- Swap Mailjet for another provider by only touching `utils/email.js` —
  nothing else calls it directly except the grading route.
