# thesis-tools

Three small tools to help you submit a thesis honestly. They point out problems and help you write in your own words. They never rewrite text, and they are not for lowering plagiarism or AI-detector scores.

Python 3, standard library only. Reads .txt, .md, .docx, and .pdf (needs `pypdf` or the `pdftotext` command). The files in `samples/` are made up.

## overlap.py: where does my draft copy my sources?
    python3 overlap.py samples/draft.txt samples/source.txt --out report.md
Finds runs of 8+ shared words and gives each passage a verdict: add quotation marks + citation, add citation, too close (rewrite and cite), or OK.

## ai_usage.py: how much did AI help?
    python3 ai_usage.py samples/draft.txt --allowance 30 --tool "ChatGPT" --purpose "outlining" --strip clean.txt
Mark AI-assisted text with `[AI]` ... `[/AI]`. Prints PASS or OVER against your allowance, lists each section, and drafts a disclosure statement. Exit code 1 if OVER.

## coach.py: rewrite it yourself
    python3 coach.py passage.txt
    python3 coach.py --from-report report.md
Asks four questions per flagged passage and joins your own answers into a paragraph, saved to `coached.md`. Warns if you still echo the original or gave no citation. Answers can be piped in on stdin.

## Test
    python3 test_tools.py
