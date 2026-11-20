#!/usr/bin/env python3
"""Measure how much of a draft you marked [AI]...[/AI] and draft a plain disclosure statement."""
import argparse, re, sys
from common import load_text

SEC = re.compile(r"\[AI\](.*?)\[/AI\]", re.S)


def count(draft):
    """-> (ai_words, total_words, sections) with the markers themselves excluded."""
    secs = [m.group(1).split() for m in SEC.finditer(draft)]
    total = len(re.sub(r"\[/?AI\]", " ", draft).split())
    return sum(map(len, secs)), total, secs


def main():
    ap = argparse.ArgumentParser(description=__doc__)
    ap.add_argument("draft")
    ap.add_argument("--allowance", type=float, required=True, help="max AI-assisted percentage")
    ap.add_argument("--tool", default="[tool name]")
    ap.add_argument("--purpose", default="[what you used it for]")
    ap.add_argument("--strip", help="write a copy of the draft without markers")
    a = ap.parse_args()
    text = load_text(a.draft)
    if len(re.findall(r"\[AI\]", text)) != len(re.findall(r"\[/AI\]", text)):
        sys.exit("Unbalanced markers: every [AI] needs a matching [/AI].")
    ai, total, secs = count(text)
    pct = 100 * ai / max(total, 1)
    status = "PASS" if pct <= a.allowance else "OVER"
    print(f"{status}: {ai} AI-assisted / {total} total words = {pct:.1f}% (allowance {a.allowance:g}%)")
    for i, s in enumerate(secs, 1):
        print(f"  {i}. {' '.join(s[:12])}{'...' if len(s) > 12 else ''} ({len(s)} words)")
    print("\nDisclosure statement:\n"
          f"I used {a.tool} for {a.purpose}. About {pct:.1f}% of the words in this work ({ai} of {total}) "
          "were AI-assisted. I reviewed all of it and I am responsible for the final text.")
    if a.strip:
        with open(a.strip, "w", encoding="utf8") as f:
            f.write(re.sub(r"\[/?AI\]", "", text))
        print(f"\nMarker-free copy written to {a.strip}")
    sys.exit(status == "OVER")


if __name__ == "__main__":
    main()
