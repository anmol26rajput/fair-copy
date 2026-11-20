#!/usr/bin/env python3
"""Find draft passages that match your sources and say what to fix. Points out problems only."""
import argparse, os, re
from collections import Counter
from difflib import SequenceMatcher
from common import N, load_text, shingles, words

GAP = 5  # hits closer than this many words are merged into one passage
CITE = (r"\((?:[A-Z][\w'\-]+(?: et al\.?)?(?:,? (?:and|&) [A-Z][\w'\-]+)?),? \d{4}[a-z]?(?:, ?pp?\. ?[\d\-–]+)?\)"
        r"|\[\d+(?:\s*[,–-]\s*\d+)*\]|[A-Z][\w'\-]+(?: et al\.?)? \(\d{4}[a-z]?\)")
V_QUOTE, V_CITE = "add quotation marks + citation", "add citation"
V_CLOSE, V_OK = "too close: rewrite it in your own words and cite", "OK"


def analyze(draft, sources):
    """sources: {name: text}. Returns (draft_word_count, passages)."""
    dw = words(draft)
    norm = [w[0] for w in dw]
    src = {n: [w[0] for w in words(t)] for n, t in sources.items()}
    sh = {n: shingles(s) for n, s in src.items()}
    hits = {}
    for i in range(len(norm) - N + 1):
        key = tuple(norm[i:i + N])
        m = [(n, d[key]) for n, d in sh.items() if key in d]
        if m:
            hits[i] = m
    spans = []  # [first_hit, last_hit, [hit indices]]
    for i in sorted(hits):
        if spans and i - (spans[-1][1] + N) <= GAP:
            spans[-1][1] = i
            spans[-1][2].append(i)
        else:
            spans.append([i, i, [i]])
    out = []
    for first, last, hs in spans:
        a, b = first, last + N
        cnt = Counter(n for i in hs for n, _ in hits[i])
        best = cnt.most_common(1)[0][0]
        pos = [p for i in hs for n, p in hits[i] if n == best]
        win = src[best][min(pos):max(pos) + N]
        sim = SequenceMatcher(None, norm[a:b], win, autojunk=False).ratio()
        s, e = dw[a][1], dw[b - 1][2]
        ps = draft.rfind("\n", 0, s) + 1
        before = draft[ps:s]
        quoted = before.count('"') % 2 == 1 or before.count("“") > before.count("”")
        pe = draft.find("\n", e)
        pe = len(draft) if pe < 0 else pe
        m = re.search(r"[.!?][\"”']?(?=\s+[A-Z\[(]|\s*$)", draft[e:pe])
        end = e + m.end() if m else pe
        region = draft[s:end]
        nxt = re.match(r"\s*(?:%s)" % CITE, draft[end:end + 40])
        cited = bool(re.search(CITE, region + (nxt.group() if nxt else "")))
        verbatim = norm[a:b] == win
        if not verbatim:
            verdict = V_CLOSE
        elif not quoted:
            verdict = V_QUOTE
        elif not cited:
            verdict = V_CITE
        else:
            verdict = V_OK
        out.append(dict(text=draft[s:e], source=best, sim=sim, quoted=quoted, cited=cited,
                        verdict=verdict, nwords=b - a))
    return len(norm), out


def main():
    ap = argparse.ArgumentParser(description=__doc__)
    ap.add_argument("draft")
    ap.add_argument("sources", nargs="+")
    ap.add_argument("--out", default="report.md")
    a = ap.parse_args()
    total, ps = analyze(load_text(a.draft), {os.path.basename(p): load_text(p) for p in a.sources})
    over = sum(p["nwords"] for p in ps)
    counts = Counter(p["verdict"] for p in ps)
    lines = ["# Overlap report", "", f"Draft: {total} words, {over} overlap with sources ({100 * over / max(total, 1):.1f}%)", ""]
    for i, p in enumerate(ps, 1):
        lines += [f"## Passage {i}", "", f"- Verdict: {p['verdict']}", f"- Source: {p['source']}",
                  f"- Similarity: {p['sim']:.2f}", f"- In quotation marks: {'yes' if p['quoted'] else 'no'}",
                  f"- Citation nearby: {'yes' if p['cited'] else 'no'}", "", "> " + " ".join(p["text"].split()), ""]
    with open(a.out, "w", encoding="utf8") as f:
        f.write("\n".join(lines))
    print(f"Draft: {total} words; {over} overlap with sources ({100 * over / max(total, 1):.1f}%)")
    print(f"Passages found: {len(ps)}")
    for v, c in counts.items():
        print(f"  {c} x {v}")
    print(f"Report written to {a.out}")


if __name__ == "__main__":
    main()
