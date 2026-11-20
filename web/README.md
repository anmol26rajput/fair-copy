# Fair Copy

Three checks for a thesis draft, all running in the browser. Files are read on the student's own device and never uploaded.

- **Source overlap**: compares the draft with the PDFs, Word files or text files the student used, marks every run of eight or more matching words, and says what each one needs (quotation marks, a citation, or a rewrite in their own words).
- **AI use**: the student marks AI-assisted text, and the page shows the share of the draft against their university's allowance and writes a disclosure statement.
- **Rewrite coach**: four questions per flagged passage; the student's answers are joined into a paragraph. It never writes the words for them.

It points out problems. It does not paraphrase text or try to lower any detector's score.

## Run locally

```bash
python3 -m http.server 4173
```

Then open http://localhost:4173 (ES modules need a server; opening the file directly will not work).

## Deploy to Vercel

Import this folder as a project with framework preset "Other", no build command, and this folder as the output. Or from this folder:

```bash
npx vercel --prod
```

## Test

```bash
node test.mjs
```

Needs `../thesis-tools/samples/` next to this folder.

## Limits

- Matches are runs of eight words against the sources the student adds. Turnitin also checks the web and past submissions.
- Scanned PDFs have no text layer, so they cannot be compared.
- PDF and Word reading load pdf.js and mammoth from cdnjs.
