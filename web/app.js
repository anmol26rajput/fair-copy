import { analyze, aiUsage, coach, disclosure, stripMarkers, V } from "./logic.js";

const $ = s => document.querySelector(s);
const draft = $("#draft"), status = $("#draft-status");
const sources = new Map(); // name -> text
let flagged = []; // overlap passages that need work

const esc = s => s.replace(/[&<>"]/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]);
const fmt = n => n.toLocaleString("en");

async function readFile(file) {
  const name = file.name.toLowerCase();
  if (name.endsWith(".pdf")) {
    if (!window.pdfjsLib) throw new Error("The PDF reader did not load. Check your connection and reload.");
    pdfjsLib.GlobalWorkerOptions.workerSrc = "https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js";
    const pdf = await pdfjsLib.getDocument({ data: await file.arrayBuffer() }).promise;
    let out = "";
    for (let i = 1; i <= pdf.numPages; i++) {
      const c = await (await pdf.getPage(i)).getTextContent();
      out += c.items.map(t => t.str + (t.hasEOL ? "\n" : " ")).join("") + "\n";
    }
    return out;
  }
  if (name.endsWith(".docx")) {
    if (!window.mammoth) throw new Error("The Word reader did not load. Check your connection and reload.");
    return (await mammoth.extractRawText({ arrayBuffer: await file.arrayBuffer() })).value;
  }
  return file.text();
}

// Draft
function draftChanged() {
  const n = draft.value.split(/\s+/).filter(Boolean).length;
  status.textContent = n ? `${fmt(n)} words` : "No draft yet";
  renderAI();
}
draft.addEventListener("input", draftChanged);

$("#draft-file").addEventListener("change", async e => {
  const f = e.target.files[0];
  if (!f) return;
  status.textContent = `Reading ${f.name}…`;
  draft.setAttribute("aria-busy", "true");
  try {
    draft.value = (await readFile(f)).trim();
    draftChanged();
  } catch (err) {
    status.textContent = `Could not read ${f.name}. ${err.message || "Try saving it as .docx or .txt."}`;
  } finally {
    draft.removeAttribute("aria-busy");
    e.target.value = "";
  }
});

$("#mark-ai").addEventListener("click", () => {
  const { selectionStart: s, selectionEnd: e, value: v } = draft;
  if (s === e) { status.textContent = "Select the AI-assisted text in your draft first."; draft.focus(); return; }
  draft.value = v.slice(0, s) + "[AI]" + v.slice(s, e) + "[/AI]" + v.slice(e);
  draft.focus();
  draft.setSelectionRange(s, e + 9);
  draftChanged();
});

// Tabs: state lives in the URL hash
function showTab() {
  const tab = ["overlap", "ai", "coach"].includes(location.hash.slice(1)) ? location.hash.slice(1) : "overlap";
  document.querySelectorAll("[data-tab]").forEach(a => a.toggleAttribute("aria-current", a.dataset.tab === tab));
  document.querySelectorAll(".panel").forEach(p => (p.hidden = p.id !== `panel-${tab}`));
}
addEventListener("hashchange", showTab);
showTab();

// Overlap
const srcList = $("#src-list"), overlapOut = $("#overlap-out");
function renderSources() {
  srcList.innerHTML = [...sources.keys()].map(n =>
    `<li><span>${esc(n)}</span><button type="button" class="link" data-remove="${esc(n)}" aria-label="Remove ${esc(n)}">Remove</button></li>`).join("");
}
srcList.addEventListener("click", e => {
  const n = e.target.dataset.remove;
  if (n) { sources.delete(n); renderSources(); }
});
$("#src-files").addEventListener("change", async e => {
  const files = [...e.target.files];
  e.target.value = "";
  overlapOut.innerHTML = `<p class="empty">Reading ${files.length} file${files.length > 1 ? "s" : ""}…</p>`;
  const failed = [];
  for (const f of files) {
    try { sources.set(f.name, await readFile(f)); } catch { failed.push(f.name); }
  }
  renderSources();
  overlapOut.innerHTML = failed.length
    ? `<p class="error">Could not read ${esc(failed.join(", "))}. Scanned PDFs have no text to compare; try a .docx or .txt version.</p>`
    : `<p class="empty">${sources.size} source${sources.size > 1 ? "s" : ""} ready. Check overlap when your draft is in.</p>`;
});

function tagClass(v) { return v === V.OK ? "tag tag--in" : "tag tag--out"; }

function markedDraft(text, ps) {
  let html = "", at = 0;
  ps.forEach((p, i) => {
    html += esc(text.slice(at, p.start)) + `<mark id="m${i + 1}" class="${p.verdict === V.OK ? "ok" : ""}"><sup>${i + 1}</sup>${esc(text.slice(p.start, p.end))}</mark>`;
    at = p.end;
  });
  html += esc(text.slice(at));
  return html.split(/\n{2,}/).map(par => `<p>${par.replace(/\n/g, "<br>")}</p>`).join("");
}

$("#run-overlap").addEventListener("click", () => {
  const text = draft.value;
  if (!text.trim()) { overlapOut.innerHTML = `<p class="error">Your draft is empty. Open a file or paste your text above.</p>`; draft.focus(); return; }
  if (!sources.size) { overlapOut.innerHTML = `<p class="error">Add at least one source to compare against.</p>`; return; }
  const { total, passages } = analyze(stripMarkers(text), Object.fromEntries(sources));
  const clean = stripMarkers(text);
  flagged = passages.filter(p => p.verdict !== V.OK);
  renderCoachPick();
  const over = passages.reduce((n, p) => n + p.nwords, 0);
  if (!passages.length) {
    overlapOut.innerHTML = `<p class="empty">No runs of eight words match your sources. Paraphrases with a source still need a citation.</p>`;
    return;
  }
  overlapOut.innerHTML = `
    <dl class="figures">
      <div><dt>Words in draft</dt><dd class="num">${fmt(total)}</dd></div>
      <div><dt>Matching your sources</dt><dd class="num">${(100 * over / Math.max(total, 1)).toFixed(1)}%</dd></div>
      <div><dt>Passages to fix</dt><dd class="num">${flagged.length}</dd></div>
    </dl>
    <div class="split">
      <ol class="ruled passages">${passages.map((p, i) => `
        <li>
          <div class="passage__top"><a class="passage__n num" href="#m${i + 1}">${i + 1}</a><span class="${tagClass(p.verdict)}">${p.verdict}</span></div>
          <p class="passage__text">${esc(p.text.replace(/\s+/g, " "))}</p>
          <p class="meta">${esc(p.source)}, ${p.nwords} words, similarity ${p.sim.toFixed(2)}</p>
          ${p.verdict === V.OK ? "" : `<button type="button" class="btn btn--sm" data-coach="${flagged.indexOf(p)}">Rewrite with the coach</button>`}
        </li>`).join("")}
      </ol>
      <article class="paper" aria-label="Your draft with matches marked">${markedDraft(clean, passages)}</article>
    </div>`;
});

overlapOut.addEventListener("click", e => {
  const i = e.target.dataset.coach;
  if (i === undefined) return;
  $("#coach-pick").value = i;
  pickChanged();
  location.hash = "coach";
  $("#q-main").focus();
});

// AI use
const aiOut = $("#ai-out");
["allowance", "tool", "purpose"].forEach(id => $("#" + id).addEventListener("input", renderAI));
let lastStatement = "";
function renderAI() {
  const text = draft.value;
  if (!text.trim()) { aiOut.innerHTML = `<p class="empty">Add your draft above. The numbers update as you mark text.</p>`; return; }
  const u = aiUsage(text);
  if (!u.balanced) { aiOut.innerHTML = `<p class="error">Every [AI] needs a matching [/AI]. Check the markers in your draft.</p>`; return; }
  const allow = parseFloat($("#allowance").value);
  const limit = isNaN(allow) ? 30 : allow;
  const ok = u.pct <= limit;
  lastStatement = disclosure({ ...u, tool: $("#tool").value.trim(), purpose: $("#purpose").value.trim() });
  aiOut.innerHTML = `
    <div class="well verdict">
      <p class="figure num">${u.pct.toFixed(1)}%</p>
      <div>
        <span class="${ok ? "tag tag--in" : "tag tag--out"}">${ok ? "Within your allowance" : "Over your allowance"}</span>
        <p class="meta num">${fmt(u.ai)} of ${fmt(u.total)} words marked, ${limit}% allowed</p>
      </div>
    </div>
    ${u.sections.length ? `<ol class="ruled sections">${u.sections.map(s => `<li><span>${esc(s.slice(0, 12).join(" "))}${s.length > 12 ? "…" : ""}</span><span class="meta num">${s.length} words</span></li>`).join("")}</ol>`
      : `<p class="empty">Nothing marked yet. Select AI-assisted text in your draft and press <em>Mark selection as AI-assisted</em>.</p>`}
    <h3>Disclosure statement</h3>
    <p class="statement">${esc(lastStatement)}</p>
    <div class="actions">
      <button type="button" class="btn btn--primary" id="copy-statement">Copy statement</button>
      <button type="button" class="btn" id="download-clean">Download copy without markers</button>
    </div>`;
}
aiOut.addEventListener("click", async e => {
  if (e.target.id === "copy-statement") {
    try { await navigator.clipboard.writeText(lastStatement); e.target.textContent = "Copied"; }
    catch { e.target.textContent = "Select the text and copy it"; }
  }
  if (e.target.id === "download-clean") {
    const a = Object.assign(document.createElement("a"), {
      href: URL.createObjectURL(new Blob([stripMarkers(draft.value)], { type: "text/plain" })), download: "draft-clean.txt" });
    a.click();
    URL.revokeObjectURL(a.href);
  }
});

// Coach
const pick = $("#coach-pick"), quote = $("#coach-quote"), pasteWrap = $("#coach-paste-wrap"), coachOut = $("#coach-out");
function renderCoachPick() {
  pick.innerHTML = `<option value="">Paste a passage</option>` +
    flagged.map((p, i) => `<option value="${i}">Passage ${i + 1}: ${esc(p.text.split(/\s+/).slice(0, 8).join(" "))}…</option>`).join("");
  pickChanged();
}
function pickChanged() {
  const p = flagged[pick.value];
  pasteWrap.hidden = !!p;
  quote.hidden = !p;
  quote.textContent = p ? p.text.replace(/\s+/g, " ") : "";
  coachOut.innerHTML = "";
}
pick.addEventListener("change", pickChanged);
renderCoachPick();

let lastParagraph = "";
$("#coach-form").addEventListener("submit", e => {
  e.preventDefault();
  const p = flagged[pick.value];
  const passage = p ? p.text : $("#coach-paste").value;
  const answers = Object.fromEntries(new FormData(e.target));
  if (!answers.main.trim() && !answers.why.trim()) {
    coachOut.innerHTML = `<p class="error">Start with the main point, in your own words.</p>`;
    $("#q-main").focus();
    return;
  }
  const r = coach(passage, answers);
  lastParagraph = r.paragraph;
  coachOut.innerHTML = `
    <h3>Your paragraph</h3>
    <p class="statement">${esc(r.paragraph)}</p>
    ${r.warnings.length ? `<ul class="warnings">${r.warnings.map(w => `<li>${esc(w)}</li>`).join("")}</ul>` : `<p class="meta">No runs copied from the original, and a source is given.</p>`}
    <div class="actions"><button type="button" class="btn" id="copy-para">Copy paragraph</button></div>`;
});
coachOut.addEventListener("click", async e => {
  if (e.target.id !== "copy-para") return;
  try { await navigator.clipboard.writeText(lastParagraph); e.target.textContent = "Copied"; }
  catch { e.target.textContent = "Select the text and copy it"; }
});

draftChanged();
