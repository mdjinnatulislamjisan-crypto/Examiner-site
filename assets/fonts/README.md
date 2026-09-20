# Bengali font needed here (2 files)

Your PDF reports show garbled/corrupted characters wherever the exam has
Bengali text. This is **not a bug in the report code** — it's because
PDFKit's built-in fonts (Helvetica, Times, etc.) only support Latin
characters. They have zero Bengali glyphs, so any Bengali text gets rendered
as garbage bytes instead of failing cleanly.

The fix is to embed a real Unicode font that includes Bengali script. Once
these two files exist in this folder, `utils/pdfReport.js` picks them up
automatically — no code changes needed on your end.

## What to do (2 minutes)

1. Go to **[fonts.google.com/noto/specimen/Noto+Sans+Bengali](https://fonts.google.com/noto/specimen/Noto+Sans+Bengali)**
2. Click **Download family** (top right) — downloads a `.zip`
3. Unzip it. Inside, find the `static/` folder.
4. Copy these two files into **this folder** (`assets/fonts/`), and rename
   them to **exactly** these names:
   - `static/NotoSansBengali-Regular.ttf` → rename to `NotoSansBengali-Regular.ttf`
   - `static/NotoSansBengali-Bold.ttf` → rename to `NotoSansBengali-Bold.ttf`

   (They're very likely already named exactly this inside the zip — just
   copy them in directly and skip the renaming.)

5. Your folder should now contain:
   ```
   assets/fonts/NotoSansBengali-Regular.ttf
   assets/fonts/NotoSansBengali-Bold.ttf
   ```

## Then push it live

These are small files (~150–200 KB each) and commit to Git completely
normally — no special Git LFS setup needed:

```
git add .
git commit -m "Add Bengali font for PDF reports"
git push
```

Render will redeploy automatically. Grade a submission with Bengali
questions again and download the report — the text should now render
correctly instead of as garbled characters.

## Why this specific font

Noto Sans Bengali covers **both** Bengali script **and** Basic Latin (plain
English letters, digits, punctuation) in one file — so a single font pair
(Regular + Bold) is enough for reports that mix Bengali and English, which
is exactly what your exams do. It's free and open-source (SIL Open Font
License), so there are no licensing concerns using it in your project.

## If you skip this step

Nothing breaks — `pdfReport.js` checks whether these two files exist before
using them. If they're missing, it silently falls back to the default
Helvetica font, so English-only reports still work fine. Bengali text will
just go back to rendering as garbled characters until you add the files.
