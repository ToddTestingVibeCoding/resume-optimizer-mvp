<!-- script.js -->
<script>
// ================================
// Resume Optimizer - script.js
// Lessons 1–20 consolidated
// ================================

// ---------- Config ----------
const BASE_REWRITES_PER_DAY = 5;
const EMAIL_BONUS_REWRITES = 5; // total becomes 10/day with email
const AUTOSAVE_DEBOUNCE_MS = 400;

// ---- LocalStorage Keys ----
const LS_KEYS = {
  resume: "ro.resume",
  jd: "ro.jd",
  savedAt: "ro.savedAt",
  rewritesUsed: "ro.rewrites.used",
  rewritesDate: "ro.rewrites.date",
  email: "ro.email"
};

// ---------- Utilities ----------
function debounce(fn, wait) {
  let t;
  return (...args) => {
    clearTimeout(t);
    t = setTimeout(() => fn(...args), wait);
  };
}

function spinnerHTML(text = "Working…") {
  return `<span class="spinner" aria-hidden="true"></span>${text}`;
}

function friendlyError(err) {
  const msg = (err?.message || String(err || "")).toLowerCase();

  if (msg.includes("invalid_api_key") || msg.includes("api key"))
    return "API key issue on the server. Try again later or contact support.";
  if (msg.includes("rate limit") || msg.includes("429"))
    return "The AI is busy right now. I’ll retry automatically, or please try again in a moment.";
  if (msg.includes("network") || msg.includes("failed to fetch"))
    return "Network hiccup. Please check your connection and try again.";
  if (msg.includes("file") && msg.includes("upload"))
    return "Upload failed. Make sure you selected a .docx, .pdf, or .txt file.";
  if (msg.includes("method not allowed") || msg.includes("405"))
    return "That action isn’t available. Try refreshing and repeating the step.";
  return err?.message || "Something went wrong. Please try again.";
}

// ---------- Simple alert messaging ----------
function showMessage(type, text) {
  // types: info | success | warn | error
  let box = document.getElementById("messages");
  if (!box) box = document.getElementById("summary");
  if (!box) return;
  const div = document.createElement("div");
  div.className = `alert ${type}`;
  div.textContent = text;
  box.prepend(div);
  setTimeout(() => { if (div && div.parentNode) div.parentNode.removeChild(div); }, 5000);
}

// ---------- Loading wrapper ----------
function withLoading(btn, labelWhileLoading, fn) {
  return async function (...args) {
    let originalHTML;
    if (btn) {
      btn.disabled = true;
      originalHTML = btn.innerHTML;
      btn.innerHTML = spinnerHTML(labelWhileLoading);
    }
    try {
      return await fn(...args);
    } finally {
      if (btn) {
        btn.disabled = false;
        btn.innerHTML = originalHTML;
      }
    }
  };
}

// ---------- Network helper: JSON fetch with one retry on 429/5xx (Lesson 20) ----------
async function fetchJSONWithRetry(url, opts = {}, retryDelayMs = 1200) {
  const attempt = async () => {
    const r = await fetch(url, opts);
    if (r.ok) return r.json();

    let detail = "";
    try { detail = await r.text(); } catch {}
    const msg = detail || `HTTP ${r.status}`;
    const retryable = r.status === 429 || (r.status >= 500 && r.status < 600);
    return { __error: true, status: r.status, message: msg, retryable };
  };

  let res = await attempt();
  if (!res?.__error) return res;
  if (!res.retryable) throw new Error(res.message);
  await new Promise(r => setTimeout(r, retryDelayMs));
  res = await attempt();
  if (!res?.__error) return res;
  throw new Error(res.message);
}

// ---------- Tokenizing & keyword stats (client-side analysis fallback) ----------
const STOPWORDS = new Set([
  "the","and","or","to","a","of","in","for","on","with","is","are","as","at","by",
  "an","be","this","that","from","it","you","your","we","our","their","they",
  "will","can","ability","responsible","responsibilities","experience","years"
]);

function tokenize(text) {
  return (text || "")
    .toLowerCase()
    .replace(/[^a-z0-9\s\-+.#]/g, " ")
    .split(/\s+/)
    .filter(Boolean);
}
function keywordCounts(text) {
  const counts = new Map();
  for (const tok of tokenize(text)) {
    if (STOPWORDS.has(tok)) continue;
    if (tok.length < 3) continue;
    counts.set(tok, (counts.get(tok) || 0) + 1);
  }
  return counts;
}
function topTerms(counts, limit = 20) {
  return [...counts.entries()]
    .sort((a,b) => b[1]-a[1])
    .slice(0, limit)
    .map(([term,count]) => ({ term, count }));
}
function missingTerms(jdTop, resumeCounts) {
  const missing = [];
  for (const {term,count} of jdTop) {
    if (!resumeCounts.has(term)) missing.push({ term, jdCount: count });
  }
  return missing;
}
function roughSuggestions(missing) {
  return missing.slice(0, 10).map(({term}) =>
    `Add a bullet using “${term}” in context (quantify impact, name tools, or outcomes).`
  );
}
function renderList(el, items, formatter = (x)=>x) {
  if (!el) return;
  el.innerHTML = "";
  for (const item of items) {
    const li = document.createElement("li");
    li.textContent = formatter(item);
    el.appendChild(li);
  }
}

// ---------- Character counters ----------
function updateCounterFrom(el, counterEl) {
  if (!el || !counterEl) return;
  counterEl.textContent = `${(el.value || "").length} characters`;
}
function wireCounters() {
  const resumeEl = document.getElementById("resume");
  const jobDescEl = document.getElementById("jobDesc") || document.getElementById("jd");
  const resumeCount = document.getElementById("resumeCount");
  const jobDescCount = document.getElementById("jobDescCount");

  if (resumeEl && resumeCount) {
    updateCounterFrom(resumeEl, resumeCount);
    resumeEl.addEventListener("input", () => updateCounterFrom(resumeEl, resumeCount));
  }
  if (jobDescEl && jobDescCount) {
    updateCounterFrom(jobDescEl, jobDescCount);
    jobDescEl.addEventListener("input", () => updateCounterFrom(jobDescEl, jobDescCount));
  }
}

// ---------- Usage limits + email unlock ----------
function todaysKey() {
  const d = new Date();
  return `${d.getUTCFullYear()}-${d.getUTCMonth()+1}-${d.getUTCDate()}`;
}
function getMaxRewrites() {
  return localStorage.getItem(LS_KEYS.email) ? BASE_REWRITES_PER_DAY + EMAIL_BONUS_REWRITES : BASE_REWRITES_PER_DAY;
}
function getRewritesUsed() {
  const day = localStorage.getItem(LS_KEYS.rewritesDate);
  const used = parseInt(localStorage.getItem(LS_KEYS.rewritesUsed) || "0", 10);
  if (day !== todaysKey()) return 0;
  return isNaN(used) ? 0 : used;
}
function incrementRewrites() {
  const day = localStorage.getItem(LS_KEYS.rewritesDate);
  if (day !== todaysKey()) {
    localStorage.setItem(LS_KEYS.rewritesDate, todaysKey());
    localStorage.setItem(LS_KEYS.rewritesUsed, "1");
    return 1;
  }
  const next = getRewritesUsed() + 1;
  localStorage.setItem(LS_KEYS.rewritesDate, todaysKey());
  localStorage.setItem(LS_KEYS.rewritesUsed, String(next));
  return next;
}
function updateUsageCounter() {
  const el = document.getElementById("usageCounter");
  if (el) el.textContent = `${getRewritesUsed()} / ${getMaxRewrites()} rewrites used today`;
}
function promptForEmailGate() {
  const email = window.prompt("You’ve hit today’s free limit. Enter your email to unlock 5 more rewrites (optional):");
  if (!email) return false;
  const ok = /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email.trim());
  if (!ok) { showMessage("error","That doesn’t look like a valid email."); return false; }
  localStorage.setItem(LS_KEYS.email, email.trim());
  showMessage("success","Thanks! You now have 5 extra rewrites today.");
  updateUsageCounter();
  return true;
}

// ---------- Draft save/load (autosave) ----------
function saveDraft() {
  const resumeEl = document.getElementById("resume");
  const jdEl = document.getElementById("jobDesc") || document.getElementById("jd");
  if (!resumeEl || !jdEl) return;

  localStorage.setItem(LS_KEYS.resume, resumeEl.value || "");
  localStorage.setItem(LS_KEYS.jd, jdEl.value || "");
  localStorage.setItem(LS_KEYS.savedAt, new Date().toISOString());

  const whenISO = localStorage.getItem(LS_KEYS.savedAt);
  setSavedStatus("resume", whenISO);
  setSavedStatus("jd", whenISO);
}
function loadDraft() {
  const resumeEl = document.getElementById("resume");
  const jdEl = document.getElementById("jobDesc") || document.getElementById("jd");
  if (!resumeEl || !jdEl) return;

  const resume = localStorage.getItem(LS_KEYS.resume) || "";
  const jd = localStorage.getItem(LS_KEYS.jd) || "";
  resumeEl.value = resume;
  jdEl.value = jd;

  // refresh counters
  const resumeCount = document.getElementById("resumeCount");
  const jobDescCount = document.getElementById("jobDescCount");
  if (resumeCount) updateCounterFrom(resumeEl, resumeCount);
  if (jobDescCount) updateCounterFrom(jdEl, jobDescCount);

  if (resume || jd) {
    const when = localStorage.getItem(LS_KEYS.savedAt);
    showMessage("info", when ? `Draft loaded (saved ${new Date(when).toLocaleString()}).` : "Draft loaded.");
  } else {
    showMessage("warn", "No saved draft found.");
  }

  const whenISO = localStorage.getItem(LS_KEYS.savedAt);
  setSavedStatus("resume", whenISO);
  setSavedStatus("jd", whenISO);
}
function clearDraft() {
  localStorage.removeItem(LS_KEYS.resume);
  localStorage.removeItem(LS_KEYS.jd);
  localStorage.removeItem(LS_KEYS.savedAt);
  setSavedStatus("resume", null);
  setSavedStatus("jd", null);
}

// saved status helpers
function setSavedStatus(which, whenISO) {
  const el = which === "resume" ? document.getElementById("resumeSaved")
                                : document.getElementById("jdSaved");
  if (!el) return;
  if (!whenISO) { el.textContent = "Not saved"; return; }
  const dt = new Date(whenISO);
  el.textContent = `Saved at ${dt.toLocaleTimeString([], {hour:'numeric', minute:'2-digit'})}`;
}
function refreshSavedStatusFromStorage() {
  const when = localStorage.getItem(LS_KEYS.savedAt);
  setSavedStatus("resume", when);
  setSavedStatus("jd", when);
}

// Offer banner on load if draft exists
function offerLoadBannerOnStartup() {
  const has = !!(localStorage.getItem(LS_KEYS.resume) || localStorage.getItem(LS_KEYS.jd));
  if (!has) return;
  const box = document.getElementById("messages");
  if (!box) return;
  const div = document.createElement("div");
  div.className = "alert info";
  div.innerHTML = `Found a saved draft. <button id="loadDraftBannerBtn" class="link-btn" type="button">Load it</button>`;
  box.prepend(div);
  const btn = document.getElementById("loadDraftBannerBtn");
  if (btn) btn.addEventListener("click", () => {
    loadDraft();
    if (div.parentNode) div.parentNode.removeChild(div);
  });
}

// ---------- Optional: Resume highlight of JD terms ----------
function computeTopJdTerms() {
  const jdEl = document.getElementById("jobDesc") || document.getElementById("jd");
  if (!jdEl) return [];
  const counts = keywordCounts(jdEl.value || "");
  return topTerms(counts, 20).map(x => x.term);
}
function highlightResumeMirror() {
  const mirror = document.getElementById("resumeMirror");
  const resumeEl = document.getElementById("resume");
  if (!mirror || !resumeEl) return;

  const text = resumeEl.value || "";
  const terms = computeTopJdTerms();

  if (!terms.length) {
    mirror.innerHTML = "";
    return;
  }

  // Build a regex that highlights whole words matching top terms
  const safe = terms.map(t => t.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"));
  const re = new RegExp(`\\b(${safe.join("|")})\\b`, "gi");

  const html = text
    .replace(/&/g,"&amp;").replace(/</g,"&lt;").replace(/>/g,"&gt;")
    .replace(re, (m) => `<mark>${m}</mark>`)
    .replace(/\n/g,"<br>");

  mirror.innerHTML = html;
  mirror.scrollTop = resumeEl.scrollTop;
}
function wireResumeMirror() {
  const toggle = document.getElementById("highlightToggle");
  const mirror = document.getElementById("resumeMirror");
  const resumeEl = document.getElementById("resume");
  const jdEl = document.getElementById("jobDesc") || document.getElementById("jd");

  if (!toggle || !mirror || !resumeEl) return;

  const update = () => {
    if (!toggle.checked) { mirror.innerHTML = ""; return; }
    highlightResumeMirror();
  };

  toggle.addEventListener("change", update);
  resumeEl.addEventListener("input", debounce(update, 150));
  if (jdEl) jdEl.addEventListener("input", debounce(update, 150));
  resumeEl.addEventListener("scroll", () => { mirror.scrollTop = resumeEl.scrollTop; });
}

// ---------- Analyze (server; with local fallback) ----------
const analyzeBtn = document.getElementById("analyzeBtn");
if (analyzeBtn) {
  const handler = withLoading(analyzeBtn, "Analyzing…", async () => {
    const resume = (document.getElementById("resume")?.value || "").trim();
    const jobDesc =
      (document.getElementById("jobDesc")?.value ||
       document.getElementById("jd")?.value || "").trim();

    const summaryEl   = document.getElementById("summary");
    const topJdEl     = document.getElementById("topJd");
    const missingEl   = document.getElementById("missing");
    const suggEl      = document.getElementById("suggestions");

    if (!resume || !jobDesc) {
      showMessage("warn","Please paste both Resume and Job Description.");
      return;
    }
    if (summaryEl) summaryEl.innerHTML = `<div class="card">${spinnerHTML("Analyzing alignment…")}</div>`;

    try {
      // Primary: call backend (with retry)
      const data = await fetchJSONWithRetry("/api/analyze", {
        method: "POST",
        headers: { "Content-Type":"application/json" },
        body: JSON.stringify({ resume, jobDesc })
      });

      const analysis    = data?.analysis;
      const serverTop   = data?.topTerms;
      const serverMiss  = data?.missingTerms;
      const serverSugg  = data?.suggestions;

      if (analysis) {
        if (summaryEl) {
          summaryEl.innerHTML =
            `<div class="card"><h3>Alignment Analysis</h3><p>${analysis.replace(/\n/g,"<br>")}</p></div>`;
        }
        if (Array.isArray(serverTop))    renderList(topJdEl, serverTop, x => `${x.term || x} (${x.count ?? ""})`.trim());
        if (Array.isArray(serverMiss))   renderList(missingEl, serverMiss, x => x.term || x);
        if (Array.isArray(serverSugg))   renderList(suggEl, serverSugg);
      } else {
        // Fallback: client-side quick analysis
        const resumeCounts = keywordCounts(resume);
        const jdCounts     = keywordCounts(jobDesc);
        const jdTop        = topTerms(jdCounts, 20);
        const miss         = missingTerms(jdTop, resumeCounts);
        const sugg         = roughSuggestions(miss);
        const coverage = ((jdTop.length - miss.length) / Math.max(1, jdTop.length) * 100).toFixed(0);

        if (summaryEl) {
          summaryEl.innerHTML = `
            <div class="card">
              <h3>Alignment Analysis</h3>
              <p><strong>Coverage:</strong> ${coverage}% of top JD terms appear in your resume.</p>
              <p><strong>Tip:</strong> Use “Suggested Actions” to weave missing terms into impact bullets.</p>
            </div>`;
        }
        renderList(topJdEl, jdTop, x => `${x.term} (${x.count})`);
        renderList(missingEl, miss, x => x.term);
        renderList(suggEl, sugg);
      }

      // refresh mirror if highlighting is on
      const toggle = document.getElementById("highlightToggle");
      if (toggle?.checked) highlightResumeMirror();

      showMessage("success","Alignment analysis complete.");
    } catch (err) {
      if (summaryEl) summaryEl.innerHTML = "";
      showMessage("error", friendlyError(err));
    }
  });
  analyzeBtn.addEventListener("click", handler);
}

// ---------- Rewrite (server; with limits + email unlock) ----------
async function callRewriteAPI(resume, jd, options) {
  // Use retry wrapper
  const data = await fetchJSONWithRetry("/api/rewrite", {
    method: "POST",
    headers: { "Content-Type":"application/json" },
    body: JSON.stringify({ resume, jd, options })
  });
  return data?.bullets || "";
}

const rewriteBtn = document.getElementById("rewriteBtn");
if (rewriteBtn) {
  const handler = withLoading(rewriteBtn, "Rewriting…", async () => {
    const resume = (document.getElementById("resume")?.value || "").trim();
    const jd = (
      document.getElementById("jobDesc")?.value ||
      document.getElementById("jd")?.value || ""
    ).trim();
    const summary = document.getElementById("summary");
    if (!resume || !jd) {
      showMessage("warn","Please paste both Resume and Job Description.");
      return;
    }

    // enforce limit
    const used = getRewritesUsed();
    const max  = getMaxRewrites();
    if (used >= max) {
      const unlocked = promptForEmailGate();
      if (!unlocked) return;
    }

    // Lesson 7 tone/seniority/role if present
    const tone = (document.getElementById("tone")?.value || "Professional");
    const seniority = (document.getElementById("seniority")?.value || "Mid");
    const role = (document.getElementById("role")?.value || "General");

    if (summary) summary.innerHTML = `<div class="card">${spinnerHTML("Rewriting with AI…")}</div>`;

    try {
      const bulletsText = await callRewriteAPI(resume, jd, { tone, seniority, role });

      const html = (bulletsText || "")
        .split("\n")
        .map(l => l.trim())
        .filter(Boolean)
        .map(l => l.replace(/^[-•*\d.)\s]+/, "")) // strip list markers
        .map(l => `<li>${l}</li>`)
        .join("");

      if (summary) {
        summary.innerHTML = `
          <div class="card">
            <h3>AI Suggested Bullets</h3>
            <ul>${html}</ul>
          </div>`;
      }
      incrementRewrites();
      updateUsageCounter();
      showMessage("success", `AI rewrite complete. (${getRewritesUsed()}/${getMaxRewrites()} used today)`);
    } catch (err) {
      if (summary) summary.innerHTML = "";
      showMessage("error", friendlyError(err));
    }
  });
  rewriteBtn.addEventListener("click", handler);
}

// ---------- Copy + Download bullets ----------
function getCurrentBullets() {
  const summary = document.getElementById("summary");
  const lis = summary ? summary.querySelectorAll("li") : [];
  return Array.from(lis).map(li => li.textContent.trim()).filter(Boolean);
}

// Copy bullets
const copyBtn = document.getElementById("copyBtn");
if (copyBtn) {
  copyBtn.addEventListener("click", async () => {
    const bullets = getCurrentBullets();
    if (!bullets.length) { showMessage("warn","No AI bullets to copy yet!"); return; }
    try {
      await navigator.clipboard.writeText(bullets.join("\n"));
      showMessage("success","Copied AI bullets to your clipboard.");
    } catch (err) {
      showMessage("error","Copy failed: " + (err?.message || err));
    }
  });
}

// Download bullets DOCX via backend
const downloadBtn = document.getElementById("downloadBtn");
if (downloadBtn) {
  const handler = withLoading(downloadBtn, "Preparing DOCX…", async () => {
    const bullets = getCurrentBullets();
    if (!bullets.length) { showMessage("warn","No AI bullets to download yet!"); return; }
    try {
      const r = await fetch("/api/download-docx", {
        method:"POST",
        headers:{ "Content-Type":"application/json" },
        body: JSON.stringify({ title:"AI Suggested Resume Bullets", bullets })
      });
      if (!r.ok) throw new Error(await r.text());

      const blob = await r.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url; a.download = "ai_resume_bullets.docx";
      document.body.appendChild(a); a.click(); document.body.removeChild(a);
      URL.revokeObjectURL(url);
      showMessage("success","Downloaded DOCX. Open it in Word/Pages.");
    } catch (err) {
      showMessage("error", friendlyError(err));
    }
  });
  downloadBtn.addEventListener("click", handler);
}

// ---------- Upload resume → /api/extract ----------
const uploadBtn = document.getElementById("uploadBtn");
const resumeFileInput = document.getElementById("resumeFile");
if (uploadBtn && resumeFileInput) {
  uploadBtn.addEventListener("click", () => resumeFileInput.click());
  resumeFileInput.addEventListener("change", async () => {
    const file = resumeFileInput.files?.[0];
    if (!file) { showMessage("warn","No file selected."); return; }

    const formData = new FormData();
    formData.append("file", file);

    let originalHTML;
    if (uploadBtn) { originalHTML = uploadBtn.innerHTML; uploadBtn.disabled = true; uploadBtn.innerHTML = spinnerHTML("Extracting…"); }

    try {
      const r = await fetch("/api/extract", { method: "POST", body: formData }); // no Content-Type header
      if (!r.ok) throw new Error(await r.text());
      const data = await r.json();
      const resumeEl = document.getElementById("resume");
      if (resumeEl) {
        resumeEl.value = data.text || "";
        const resumeCount = document.getElementById("resumeCount");
        if (resumeCount) updateCounterFrom(resumeEl, resumeCount);
      }
      showMessage("success","File text extracted and added to your resume.");
      saveDraft(); // autosave after import
    } catch (err) {
      showMessage("error", friendlyError(err));
    } finally {
      if (uploadBtn) { uploadBtn.disabled = false; uploadBtn.innerHTML = originalHTML; }
      resumeFileInput.value = "";
    }
  });
}

// ---------- Draft Resume (beta) ----------
function buildDraftResume(resume, jd, bullets) {
  const safeBullets = (bullets || []).map(b => `• ${b}`).join("\n");
  return `Full Resume Draft (Beta)

Objective
  Tailored resume for the provided job description using quantified, impact-focused bullets.

Summary Highlights
${safeBullets}

Experience
  (Replace with your real roles; adapt bullets above under each role as needed.)

Skills
  (List the top tools/skills from the JD + your background.)

Notes
  This is a quick draft scaffold built from AI bullets. Edit freely.`;
}

const buildDraftBtn = document.getElementById("buildDraftBtn");
const downloadDraftBtn = document.getElementById("downloadDraftBtn");

if (buildDraftBtn) {
  buildDraftBtn.addEventListener("click", () => {
    const resume = (document.getElementById("resume")?.value || "").trim();
    const jd = (document.getElementById("jobDesc")?.value || document.getElementById("jd")?.value || "").trim();
    const draftEl = document.getElementById("draftResume");
    const bullets = getCurrentBullets();

    if (!bullets.length) { showMessage("warn","No AI bullets found. Click “Rewrite for Alignment (AI)” first."); return; }

    const draft = buildDraftResume(resume, jd, bullets);
    if (draftEl) {
      draftEl.value = draft;
      showMessage("success","Draft built from your AI bullets. Edit freely before downloading.");
    } else {
      // If there's no draft textarea in DOM, offer plain text download immediately
      downloadTextFile("Draft Resume", draft);
    }
  });
}

if (downloadDraftBtn) {
  const handler = withLoading(downloadDraftBtn, "Packaging…", async () => {
    const draftEl = document.getElementById("draftResume");
    const text = (draftEl?.value || "").trim();
    if (!text) { showMessage("warn","No draft content to download yet. Click “Build Draft from Bullets” first."); return; }

    try {
      const r = await fetch("/api/download-text", {
        method:"POST",
        headers:{ "Content-Type":"application/json" },
        body: JSON.stringify({ title:"Draft Resume", text })
      });
      if (!r.ok) throw new Error(await r.text());

      const blob = await r.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url; a.download = "draft_resume.txt";
      document.body.appendChild(a); a.click(); document.body.removeChild(a);
      URL.revokeObjectURL(url);
      showMessage("success","Draft downloaded as .txt");
    } catch (err) {
      showMessage("error", friendlyError(err));
    }
  });
  downloadDraftBtn.addEventListener("click", handler);
}

function downloadTextFile(title, text) {
  const blob = new Blob([text], { type: "text/plain;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  const filename = `${title.replace(/[^\w.-]+/g, "_").slice(0,64)}.txt`;
  a.href = url; a.download = filename;
  document.body.appendChild(a); a.click(); document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

// ---------- Export / Import session ----------
const exportBtn = document.getElementById("exportBtn");
if (exportBtn) {
  exportBtn.addEventListener("click", () => {
    const dump = {
      resume: localStorage.getItem(LS_KEYS.resume) || "",
      jd: localStorage.getItem(LS_KEYS.jd) || "",
      savedAt: localStorage.getItem(LS_KEYS.savedAt) || null,
      rewritesUsed: getRewritesUsed(),
      rewritesDate: localStorage.getItem(LS_KEYS.rewritesDate) || null,
      email: localStorage.getItem(LS_KEYS.email) || null,
      exportedAt: new Date().toISOString()
    };
    const blob = new Blob([JSON.stringify(dump, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url; a.download = "resume_optimizer_session.json";
    document.body.appendChild(a); a.click(); document.body.removeChild(a);
    URL.revokeObjectURL(url);
    showMessage("success","Session exported.");
  });
}
const importBtn  = document.getElementById("importBtn");
const importFile = document.getElementById("importFile");
if (importBtn && importFile) {
  importBtn.addEventListener("click", () => importFile.click());
  importFile.addEventListener("change", async () => {
    const file = importFile.files?.[0];
    if (!file) return;
    try {
      const text = await file.text();
      const data = JSON.parse(text);
      if (typeof data.resume === "string") localStorage.setItem(LS_KEYS.resume, data.resume);
      if (typeof data.jd === "string") localStorage.setItem(LS_KEYS.jd, data.jd);
      if (typeof data.savedAt === "string") localStorage.setItem(LS_KEYS.savedAt, data.savedAt);
      if (typeof data.rewritesDate === "string") localStorage.setItem(LS_KEYS.rewritesDate, data.rewritesDate);
      if (typeof data.rewritesUsed === "number") localStorage.setItem(LS_KEYS.rewritesUsed, String(data.rewritesUsed));
      if (typeof data.email === "string") localStorage.setItem(LS_KEYS.email, data.email);
      showMessage("success","Session imported. Click “Load Draft” to apply.");
    } catch (err) {
      showMessage("error","Import failed: " + (err?.message || err));
    } finally {
      importFile.value = "";
    }
  });
}

// ---------- Clear ----------
const clearBtn = document.getElementById("clearBtn");
if (clearBtn) {
  clearBtn.addEventListener("click", () => {
    const ids = ["resume","jobDesc","jd","summary","topJd","missing","suggestions","draftResume"];
    for (const id of ids) {
      const el = document.getElementById(id);
      if (!el) continue;
      if (el.tagName === "TEXTAREA" || el.tagName === "INPUT") el.value = "";
      else el.innerHTML = "";
    }
    const rc = document.getElementById("resumeCount");
    const jc = document.getElementById("jobDescCount");
    if (rc) rc.textContent = "0 characters";
    if (jc) jc.textContent = "0 characters";
    showMessage("info","Cleared. Paste your fresh text to continue.");
  });
}

// ---------- Draft buttons ----------
const saveBtn = document.getElementById("saveBtn");
if (saveBtn) saveBtn.addEventListener("click", () => { saveDraft(); showMessage("success","Draft saved."); });

const loadBtn = document.getElementById("loadBtn");
if (loadBtn) loadBtn.addEventListener("click", () => { loadDraft(); });

const clearDraftBtn = document.getElementById("clearDraftBtn");
if (clearDraftBtn) clearDraftBtn.addEventListener("click", () => { clearDraft(); showMessage("success","Draft cleared."); });

// ---------- Autosave wiring ----------
(function wireAutosave(){
  const resumeEl = document.getElementById("resume");
  const jobDescEl = document.getElementById("jobDesc") || document.getElementById("jd");
  if (!resumeEl || !jobDescEl) return;

  const debouncedSave = debounce(saveDraft, AUTOSAVE_DEBOUNCE_MS);
  resumeEl.addEventListener("input", debouncedSave);
  jobDescEl.addEventListener("input", debouncedSave);
})();

// ---------- Init on load ----------
document.addEventListener("DOMContentLoaded", () => {
  updateUsageCounter();
  wireCounters();
  refreshSavedStatusFromStorage();
  offerLoadBannerOnStartup();
  wireResumeMirror(); // optional highlighter
});
</script>