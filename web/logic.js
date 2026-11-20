// Pure logic, ported from thesis-tools/*.py. Points out problems only; never rewrites text.
export const N = 8;
const GAP = 5; // hits closer than this many words merge into one passage
const WORD = /[\p{L}\p{N}_]+(?:['’][\p{L}\p{N}_]+)*/gu;
export const CITE = String.raw`\((?:[A-Z][\w'\-]+(?: et al\.?)?(?:,? (?:and|&) [A-Z][\w'\-]+)?),? \d{4}[a-z]?(?:, ?pp?\. ?[\d\-–]+)?\)` +
  String.raw`|\[\d+(?:\s*[,–-]\s*\d+)*\]|[A-Z][\w'\-]+(?: et al\.?)? \(\d{4}[a-z]?\)`;
export const V = { QUOTE: "Add quotation marks and a citation", CITE: "Add a citation", CLOSE: "Too close: rewrite in your own words and cite", OK: "Quoted and cited" };

export function words(text) {
  return [...text.matchAll(WORD)].map(m => [m[0].toLowerCase().replace(/['’]/g, ""), m.index, m.index + m[0].length]);
}

export function shingles(norm, n = N) {
  const d = new Map();
  for (let i = 0; i + n <= norm.length; i++) {
    const k = norm.slice(i, i + n).join(" ");
    if (!d.has(k)) d.set(k, i);
  }
  return d;
}

// ponytail: word-level LCS ratio stands in for difflib's SequenceMatcher; O(n*m), fine for passage-sized spans.
function ratio(a, b) {
  if (!a.length && !b.length) return 1;
  let prev = new Array(b.length + 1).fill(0);
  for (const x of a) {
    const cur = [0];
    for (let j = 0; j < b.length; j++) cur.push(x === b[j] ? prev[j] + 1 : Math.max(prev[j + 1], cur[j]));
    prev = cur;
  }
  return (2 * prev[b.length]) / (a.length + b.length);
}

const same = (a, b) => a.length === b.length && a.every((x, i) => x === b[i]);

/** sources: {name: text} -> {total, passages:[{text,start,end,source,sim,quoted,cited,verdict,nwords}]} */
export function analyze(draft, sources) {
  const dw = words(draft), norm = dw.map(w => w[0]);
  const src = {}, sh = {};
  for (const [n, t] of Object.entries(sources)) { src[n] = words(t).map(w => w[0]); sh[n] = shingles(src[n]); }
  const hits = new Map();
  for (let i = 0; i + N <= norm.length; i++) {
    const k = norm.slice(i, i + N).join(" ");
    const m = Object.keys(sh).filter(n => sh[n].has(k)).map(n => [n, sh[n].get(k)]);
    if (m.length) hits.set(i, m);
  }
  const spans = [];
  for (const i of hits.keys()) {
    const last = spans[spans.length - 1];
    if (last && i - (last[1] + N) <= GAP) { last[1] = i; last[2].push(i); } else spans.push([i, i, [i]]);
  }
  const citeRe = new RegExp(CITE), citeNext = new RegExp(String.raw`^\s*(?:${CITE})`);
  const passages = spans.map(([first, last, hs]) => {
    const a = first, b = last + N;
    const cnt = {};
    for (const i of hs) for (const [n] of hits.get(i)) cnt[n] = (cnt[n] || 0) + 1;
    const best = Object.keys(cnt).reduce((x, y) => (cnt[y] > cnt[x] ? y : x));
    const pos = hs.flatMap(i => hits.get(i).filter(([n]) => n === best).map(([, p]) => p));
    const win = src[best].slice(Math.min(...pos), Math.max(...pos) + N);
    const span = norm.slice(a, b);
    const s = dw[a][1], e = dw[b - 1][2];
    const before = draft.slice(draft.lastIndexOf("\n", s - 1) + 1, s);
    const count = c => before.split(c).length - 1;
    const quoted = count('"') % 2 === 1 || count("“") > count("”");
    let pe = draft.indexOf("\n", e); if (pe < 0) pe = draft.length;
    const m = draft.slice(e, pe).match(/[.!?]["”']?(?=\s+[A-Z[(]|\s*$)/);
    const end = m ? e + m.index + m[0].length : pe;
    const nxt = draft.slice(end, end + 40).match(citeNext);
    const cited = citeRe.test(draft.slice(s, end) + (nxt ? nxt[0] : ""));
    const verdict = !same(span, win) ? V.CLOSE : !quoted ? V.QUOTE : !cited ? V.CITE : V.OK;
    return { text: draft.slice(s, e), start: s, end: e, source: best, sim: ratio(span, win), quoted, cited, verdict, nwords: b - a };
  });
  return { total: norm.length, passages };
}

const AI_SEC = /\[AI\]([\s\S]*?)\[\/AI\]/g;
const split = t => t.split(/\s+/).filter(Boolean);

/** -> {ai, total, pct, sections:[[words]], balanced} with markers excluded */
export function aiUsage(draft) {
  const balanced = (draft.match(/\[AI\]/g) || []).length === (draft.match(/\[\/AI\]/g) || []).length;
  const sections = [...draft.matchAll(AI_SEC)].map(m => split(m[1]));
  const total = split(draft.replace(/\[\/?AI\]/g, " ")).length;
  const ai = sections.reduce((n, s) => n + s.length, 0);
  return { ai, total, pct: (100 * ai) / Math.max(total, 1), sections, balanced };
}

export const stripMarkers = t => t.replace(/\[\/?AI\]/g, "");

export function disclosure({ tool, purpose, ai, total, pct }) {
  return `I used ${tool || "[tool name]"} for ${purpose || "[what you used it for]"}. About ${pct.toFixed(1)}% of the words in this work (${ai} of ${total}) were AI-assisted. I reviewed all of it and I am responsible for the final text.`;
}

const end = (s, mark = ".") => s.charAt(0).toUpperCase() + s.slice(1).replace(/[.!? ]+$/, "") + mark;

/** Joins the student's own answers; their words stay unchanged. */
export function coach(passage, { main, why, cite, prev }) {
  [main, why, cite, prev] = [main, why, cite, prev].map(x => (x || "").trim());
  if (cite && !"([".includes(cite[0])) cite = `(${cite})`;
  const parts = [prev ? end(prev) : "", main ? (cite ? end(main, "") + ` ${cite}.` : end(main)) : "", why ? end(why) : ""];
  let para = parts.filter(Boolean).join(" ");
  if (cite && !main) para = (para + " " + cite).trim();
  const mine = shingles(words([prev, main, why].filter(Boolean).join(" ")).map(w => w[0]));
  const orig = shingles(words(passage).map(w => w[0]));
  const shared = [...mine.keys()].filter(k => orig.has(k));
  const warnings = [];
  if (shared.length) warnings.push(`Your answers still share ${shared.length} run${shared.length > 1 ? "s" : ""} of eight words with the original, such as “${shared[0]}”. Put that part in your own words.`);
  if (!cite) warnings.push("No source given. Add a citation (author, year) before you use this paragraph.");
  return { paragraph: para, warnings };
}
