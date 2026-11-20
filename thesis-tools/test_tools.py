#!/usr/bin/env python3
"""Assert-based checks: python3 thesis-tools/test_tools.py"""
import os, re, subprocess, sys, tempfile

D = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, D)
S = lambda f: os.path.join(D, "samples", f)
tmp = tempfile.mkdtemp()


def run(script, *args, inp=None, ok=(0,)):
    r = subprocess.run([sys.executable, os.path.join(D, script), *args], input=inp,
                       capture_output=True, text=True, cwd=tmp)
    assert r.returncode in ok, r.stdout + r.stderr
    return r.stdout


# overlap: one verdict per sample passage, in draft order
out = run("overlap.py", S("draft.txt"), S("source.txt"), "--out", "report.md")
print(out)
report = open(os.path.join(tmp, "report.md")).read()
assert re.findall(r"- Verdict: (.+)", report) == [
    "add quotation marks + citation", "add citation",
    "too close: rewrite it in your own words and cite", "OK"], report

# ai_usage: 2 of 10 words = 20.0%
f = os.path.join(tmp, "d.txt")
open(f, "w").write("one two three four [AI]five six[/AI] seven eight nine ten")
out = run("ai_usage.py", f, "--allowance", "30", "--tool", "ChatGPT", "--purpose", "outlining", "--strip", "clean.txt")
assert "PASS: 2 AI-assisted / 10 total words = 20.0%" in out and "ChatGPT" in out and "—" not in out
assert "[AI]" not in open(os.path.join(tmp, "clean.txt")).read()
assert "OVER" in run("ai_usage.py", f, "--allowance", "10", ok=(1,))
assert "PASS" in run("ai_usage.py", S("draft.txt"), "--allowance", "30")

# coach: own words + citation -> no warnings; copied words + no citation -> both warnings
p = os.path.join(tmp, "p.txt")
open(p, "w").write("The brain replays recent experiences during slow wave sleep and gradually transfers them to long term storage.")
out = run("coach.py", p, inp="Sleep helps the brain store memories.\nIt explains why late revision backfires.\nSmith, 2020\nEarlier I showed my grades fell.\n")
assert "WARNING" not in out
assert "(Smith, 2020)" in open(os.path.join(tmp, "coached.md")).read()
out = run("coach.py", p, inp="the brain replays recent experiences during slow wave sleep\n\n\n\n")
assert "eight-word run" in out and "no source given" in out
out = run("coach.py", "--from-report", "report.md", inp="a\nb\nc, 1\nd\n" * 3)
assert open(os.path.join(tmp, "coached.md")).read().count("## Passage") == 3  # the OK passage is skipped

# PDF sample reads the same as the txt source (skipped if no PDF backend)
from common import load_text, words
try:
    assert [w[0] for w in words(load_text(S("source.pdf")))] == [w[0] for w in words(load_text(S("source.txt")))]
    print("PDF read OK")
except SystemExit as e:
    print("PDF check skipped:", e)
print("ALL TESTS PASSED")
