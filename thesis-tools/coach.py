#!/usr/bin/env python3
"""Ask guiding questions so you can rewrite a flagged passage in your own words. Never rewrites for you."""
import argparse, re, sys
from common import load_text, shingles, words

QS = ["What is the main point here, in your own words? ",
      "Why does it matter for your thesis? ",
      "What evidence or source supports it (author, year)? ",
      "How does it connect to the paragraph before? "]


def ask(q):
    try:
        return input(q).strip()
    except EOFError:
        return ""


def end(s, mark="."):
    s = s.rstrip(".!? ")
    return s + mark


def passages_from_report(path):
    out = []
    for blk in re.split(r"^## Passage \d+\s*$", load_text(path), flags=re.M)[1:]:
        v, t = re.search(r"- Verdict: (.+)", blk), re.search(r"^> (.+)$", blk, re.M)
        if v and t and v.group(1).strip() != "OK":
            out.append(t.group(1))
    return out


def main():
    ap = argparse.ArgumentParser(description=__doc__)
    ap.add_argument("passage", nargs="?", help="text file containing one passage")
    ap.add_argument("--from-report", help="overlap report.md: coach each flagged passage")
    ap.add_argument("--out", default="coached.md")
    a = ap.parse_args()
    if bool(a.passage) == bool(a.from_report):
        ap.error("give either PASSAGE or --from-report REPORT")
    ps = passages_from_report(a.from_report) if a.from_report else [" ".join(load_text(a.passage).split())]
    md = ["# Coached paragraphs", ""]
    for n, p in enumerate(ps, 1):
        print(f"\n=== Passage {n} of {len(ps)} ===\n{p}\n")
        main_pt, why, cite, prev = (ask(q) for q in QS)
        cite = f"({cite})" if cite and cite[0] not in "([" else cite
        parts = [end(prev) if prev else "", (end(main_pt) if not cite else end(main_pt) [:-1] + f" {cite}.") if main_pt else "",
                 end(why) if why else ""]
        para = " ".join(x for x in parts if x)
        if cite and not main_pt:
            para = (para + " " + cite).strip()
        mine = shingles([w[0] for w in words(" ".join(x for x in (prev, main_pt, why) if x))])
        orig = shingles([w[0] for w in words(p)])
        shared = [k for k in mine if k in orig]
        warns = []
        if shared:
            warns.append(f"WARNING: your answers still share {len(shared)} eight-word run(s) with the original, "
                         f"e.g. \"{' '.join(shared[0])}\". Put that part in your own words.")
        if not cite:
            warns.append("WARNING: no source given. Add a citation (author, year) before using this paragraph.")
        print(f"\nYour paragraph:\n{para}")
        for w in warns:
            print(w)
        md += [f"## Passage {n}", "", para, ""] + [f"- {w}" for w in warns] + [""]
    with open(a.out, "w", encoding="utf8") as f:
        f.write("\n".join(md))
    print(f"\nSaved to {a.out}")


if __name__ == "__main__":
    main()
