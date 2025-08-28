// =====================================
// Resume Optimizer — script.js (Production)
// Works with Lesson 15+ HTML/CSS
// =====================================

// ---------- Config ----------
const BASE_REWRITES_PER_DAY = 5;
const EMAIL_BONUS_REWRITES = 5;         // total 10/day when email provided
const AUTOSAVE_DEBOUNCE_MS = 400;

// LocalStorage keys
const LS = {
  resume: "ro.resume",
  jd: "ro.jd",
  savedAt: "ro.savedAt",
  // usage
  usageDate: "ro.usage.date",
  usageCount: "ro.usage.count",
  email: "ro.email",
  emailBonusDate: "ro.emailBonus.date"
};

// ---------- Small utilities ----------
function $(id) { return document.getElementById(id); }

function debounce(fn, ms) {
  let t;
  return (...args) => { clearTimeout(t); t = setTimeout(() => fn(...args), ms); };
}

function todayStr() {
  const d = new Date();
  return d.toISOString().slice(0,10); // YYYY-MM-DD
}

function spinnerHTML(text = "Working…") {
  return `<span class="spinner" aria-hidden="true"></span>${text}`;
}

function withLoading(btn, labelWhileLoading, fn) {
  return async (...args) => {
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

// ---------- Friendly error messages ----------
function friendlyError(err) {
  try {
    // Network / fetch text strings
    const msg = typeof err === "string" ? err : (err?.message || "");
    if (/rate limit/i.test(msg) || /429/.test(msg)) {
      return "We’re getting rate-limited. Please wait a moment and try again.";
    }
    if (/network/i.test(msg)) {
      return "Network issue. Please check your connection and try again.";
    }
    // JSON payloads we bubbled up from API
    const parsed = (() => { try { return JSON.parse(msg); } catch { return null; }})();
    if (parsed?.error) {
      if (/invalid_api_key/i.test(parsed.detail || "") || /api key/i.test(parsed.detail || "")) {
        return "Server missing API key. If this is your project, add OPENAI_API_KEY in Vercel → Settings → Environment Variables.";
      }
      return parsed.detail || parsed.error || "Server error.";
    }
    return msg || "Something went wrong. Please try again.";
  } catch {
    return "Something went wrong. Please try again.";
  }
}

// ---------- Simple alert messaging ----------
function showMessage(type, text) {
  // type: info | success | warn | error
  let box = $("messages");
  if (!box) box = $("summary");
  if (!box) return;
  const div = document.createElement("div");
  div.className = `alert ${type}`;
  div.textContent = text;
  box.prepend(div);
  setTimeout(() => { if (div.parentNode) div.parentNode.removeChild(div); }, 5000);
}

// ---------- Character counters ----------
function updateCounterFrom(el, counterEl) {
  if (!el || !counterEl) return;
  counterEl.textContent = `${(el.value || "").length} characters`;
}
function wireCounters() {
  const resumeEl = $("resume");
  const jobDescEl = $("jobDesc") || $("jd");
  const resumeCount = $("resumeCount");
  const jobDescCount = $("jobDescCount");

  if (resumeEl && resumeCount) {
    updateCounterFrom(resumeEl, resumeCount);
    resumeEl.addEventListener("input", () => updateCounterFrom(resumeEl, resumeCount));
  }
  if (jobDescEl && jobDescCount) {
    updateCounterFrom(jobDescEl, jobDescCount);
    jobDescEl.addEventListener("input", () => updateCounterFrom(jobDescEl, jobDescCount));
  }
}

// ---------- Draft autosave / load ----------
function getResumeEl() { return $("resume"); }
function getJdEl() { return $("jobDesc") || $("jd"); }

function saveDraft() {
  const r = getResumeEl(), j = getJdEl();
  if (!r || !j) return;
  localStorage.setItem(LS.resume, r.value || "");
  localStorage.setItem(LS.jd, j.value || "");
  localStorage.setItem(LS.savedAt, new Date().toISOString());
}

function loadDraft() {
  const r = getResumeEl(), j = getJdEl();
  if (!r || !j) return;
  const resume = localStorage.getItem(LS.resume) || "";
  const jd = localStorage.getItem(LS.jd) || "";
  r.value = resume;
  j.value = jd;

  const resumeCount = $("resumeCount");
  const jobDescCount = $("jobDescCount");
  if (resumeCount) updateCounterFrom(r, resumeCount);
  if (jobDescCount) updateCounterFrom(j, jobDescCount);
}

function clearDraft() {
  localStorage.removeItem(LS.resume);
  localStorage.removeItem(LS.jd);
  localStorage.removeItem(LS.savedAt);
}

function maybeOfferLoadDraftBanner() {
  const hasResume = !!localStorage.getItem(LS.resume);
  const hasJd = !!localStorage.getItem(LS.jd);
  if (!hasResume && !hasJd) return;

  const box = $("messages");
  if (!box) return;

  const whenIso = localStorage.getItem(LS.savedAt);
  const whenText = whenIso ? new Date(whenIso).toLocaleString() : "earlier";
  const div = document.createElement("div");
  div.className = "alert info";
  div.innerHTML = `
    You have a saved draft from <strong>${whenText}</strong>.
    <button id="loadDraftInline" class="btn secondary" style="margin-left:8px;">Load Draft</button>
    <button id="dismissDraftInline" class="btn ghost" style="margin-left:6px;">Dismiss</button>
  `;
  box.prepend(div);
  div.querySelector("#loadDraftInline")?.addEventListener("click", () => { loadDraft(); div.remove(); });
  div.querySelector("#dismissDraftInline")?.addEventListener("click", () => div.remove());
}

// Autosave wiring
function wireAutosave() {
  const r = getResumeEl(), j = getJdEl();
  if (!r || !j) return;
  const debounced = debounce(saveDraft, AUTOSAVE_DEBOUNCE_MS);
  r.addEventListener("input", debounced);
  j.addEventListener("input", debounced);
}

// ---------- Usage limits (rewrite per day) ----------
function getDailyCap() {
  // base + (bonus if email set today or previously granted today)
  const email = localStorage.getItem(LS.email);
  if (!email) return BASE_REWRITES_PER_DAY;

  // Optional: you could only grant bonus once per day, but simpler: if email exists, grant bonus always.
  return BASE_REWRITES_PER_DAY + EMAIL_BONUS_REWRITES;
}

function initUsageIfNeeded() {
  const today = todayStr();
  const storedDate = localStorage.getItem(LS.usageDate);
  if (storedDate !== today) {
    localStorage.setItem(LS.usageDate, today);
    localStorage.setItem(LS.usageCount, "0");
  }
}

function getRewritesUsed() {
  initUsageIfNeeded();
  return parseInt(localStorage.getItem(LS.usageCount) || "0", 10);
}
function incrementRewrites() {
  initUsageIfNeeded();
  const used = getRewritesUsed() + 1;
  localStorage.setItem(LS.usageCount, String(used));
  updateUsageCounter();
}
function updateUsageCounter() {
  const el = $("usageCounter");
  if (!el) return;
  el.textContent = `${getRewritesUsed()} / ${getDailyCap()} rewrites used today`;
}

// Prompt for email to unlock more (simple modal-free prompt)
async function maybeAskForEmail() {
  // You can replace with a proper modal later
  const email = window.prompt("Daily limit reached. Enter your email to unlock 5 more rewrites today:");
  if (!email) return false;
  // Very lightweight validation
  if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) {
    showMessage("warn", "That doesn’t look like a valid email.");
    return false;
  }
  localStorage.setItem(LS.email, email.trim());
  localStorage.setItem(LS.emailBonusDate, todayStr());
  updateUsageCounter();
  showMessage("success", "Bonus unlocked! You now have 10 rewrites today.");
  return true;
}

// ---------- Keyword analysis (front-end) ----------
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
  for (const {term, count} of jdTop) {
    if (!resumeCounts.has(term)) missing.push({ term, jdCount: count });
  }
  return missing;
}
function roughSuggestions(missing) {
  return missing.slice(0, 10).map(({term}) =>
    `Add a bullet using “${term}” in context (quantify impact, include tools, outcomes).`
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

// ---------- Analyze Alignment (no AI) ----------
function wireAnalyze() {
  const analyzeBtn = $("analyzeBtn");
  if (!analyzeBtn) return;

  const handler = withLoading(analyzeBtn, "Analyzing…", async () => {
    const resume = (getResumeEl()?.value || "").trim();
    const jd = (getJdEl()?.value || "").trim();
    if (!resume || !jd) {
      showMessage("warn", "Please paste both Resume and Job Description.");
      return;
    }

    // Local front-end stats
    const summaryEl = $("summary");
    const topJdEl = $("topJd");
    const missingEl = $("missing");
    const suggestionsEl = $("suggestions");

    const resumeCounts = keywordCounts(resume);
    const jdCounts = keywordCounts(jd);

    const jdTop = topTerms(jdCounts, 20);
    const miss = missingTerms(jdTop, resumeCounts);
    const sugg = roughSuggestions(miss);

    const coverage = ((jdTop.length - miss.length) / Math.max(1, jdTop.length) * 100).toFixed(0);
    if (summaryEl) {
      summaryEl.innerHTML = `
        <div class="card">
          <h3>Alignment Analysis</h3>
          <p><strong>Coverage:</strong> ${coverage}% of top JD terms appear in your resume.</p>
          <p><strong>Next step:</strong> Use “Suggested Actions” to weave missing terms into impact bullets.</p>
        </div>
      `;
    }

    renderList(topJdEl, jdTop, x => `${x.term} (${x.count})`);
    renderList(missingEl, miss, x => x.term);
    renderList(suggestionsEl, sugg);

    showMessage("success", "Alignment analysis complete.");
  });

  analyzeBtn.addEventListener("click", handler);
}

// ---------- AI Rewrite (secure backend) ----------
async function callRewriteAPI(resume, jd, opts = {}) {
  const r = await fetch("/api/rewrite", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ resume, jd, ...opts })
  });
  if (!r.ok) {
    const t = await r.text();
    throw new Error(t);
  }
  const data = await r.json();
  return data.bullets || "";
}

function getDailyRemaining() {
  return Math.max(0, getDailyCap() - getRewritesUsed());
}

function wireRewrite() {
  const rewriteBtn = $("rewriteBtn");
  if (!rewriteBtn) return;

  const handler = withLoading(rewriteBtn, "Rewriting…", async () => {
    const resume = (getResumeEl()?.value || "").trim();
    const jd = (getJdEl()?.value || "").trim();
    const summary = $("summary");
    if (!resume || !jd) {
      showMessage("warn", "Please paste both Resume and Job Description.");
      return;
    }

    // Check limits
    if (getDailyRemaining() <= 0) {
      const unlocked = await maybeAskForEmail();
      if (!unlocked && getDailyRemaining() <= 0) {
        showMessage("warn", "Daily limit reached. Try again tomorrow.");
        return;
      }
    }

    // Optional UX controls (if present)
    const tone = ($("tone")?.value || "Professional").toLowerCase();
    const seniority = ($("seniority")?.value || "Mid").toLowerCase();
    const role = ($("role")?.value || "General").toLowerCase();

    if (summary) summary.innerHTML = `<div class="card">${spinnerHTML("Rewriting with AI…")}</div>`;

    try {
      const bulletsText = await callRewriteAPI(resume, jd, { tone, seniority, role });

      const html = bulletsText
        .split("\n")
        .map(l => l.trim())
        .filter(Boolean)
        .map(l => l.replace(/^[-•*\d.)\s]+/, "")) // strip leading markers
        .map(l => `<li>${l}</li>`)
        .join("");

      if (summary) {
        summary.innerHTML = `
          <div class="card">
            <h3>AI Suggested Bullets</h3>
            <ul>${html}</ul>
          </div>
        `;
      }

      incrementRewrites();
      showMessage("success", `AI rewrite complete. (${getRewritesUsed()}/${getDailyCap()} used today)`);
    } catch (e) {
      if (summary) summary.innerHTML = "";
      showMessage("error", friendlyError(e));
    }
  });

  rewriteBtn.addEventListener("click", handler);
}

// ---------- Copy + Download ----------
function getCurrentBullets() {
  const lis = $("summary")?.querySelectorAll("li") || [];
  return Array.from(lis).map(li => li.textContent.trim()).filter(Boolean);
}

function wireCopy() {
  const copyBtn = $("copyBtn");
  if (!copyBtn) return;
  const handler = withLoading(copyBtn, "Copying…", async () => {
    const bullets = getCurrentBullets();
    if (!bullets.length) { showMessage("warn", "No AI bullets to copy yet!"); return; }
    try {
      await navigator.clipboard.writeText(bullets.join("\n"));
      showMessage("success", "Copied AI bullets to clipboard.");
    } catch (err) {
      showMessage("error", friendlyError(err));
    }
  });
  copyBtn.addEventListener("click", handler);
}

function wireDownload() {
  const downloadBtn = $("downloadBtn");
  if (!downloadBtn) return;

  const handler = withLoading(downloadBtn, "Preparing DOCX…", async () => {
    const bullets = getCurrentBullets();
    if (!bullets.length) { showMessage("warn", "No AI bullets to download yet!"); return; }

    try {
      const r = await fetch("/api/download-docx", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ title: "AI Suggested Resume Bullets", bullets })
      });
      if (!r.ok) throw new Error(await r.text());

      const blob = await r.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = "ai_resume_bullets.docx";
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);

      showMessage("success", "Downloaded DOCX. Open it in Word/Pages.");
    } catch (e) {
      showMessage("error", friendlyError(e));
    }
  });

  downloadBtn.addEventListener("click", handler);
}

// ---------- Clear + Draft buttons ----------
function wireClear() {
  const clearBtn = $("clearBtn");
  if (!clearBtn) return;
  clearBtn.addEventListener("click", () => {
    const ids = ["resume","jobDesc","jd","summary","topJd","missing","suggestions"];
    for (const id of ids) {
      const el = $(id);
      if (!el) continue;
      if (el.tagName === "TEXTAREA" || el.tagName === "INPUT") el.value = "";
      else el.innerHTML = "";
    }
    clearDraft();
    const rc = $("resumeCount"); if (rc) rc.textContent = "0 characters";
    const jc = $("jobDescCount"); if (jc) jc.textContent = "0 characters";
    showMessage("info", "Cleared. Paste your fresh text to continue.");
  });
}
function wireDraftButtons() {
  $("saveBtn")?.addEventListener("click", () => { saveDraft(); showMessage("success","Draft saved."); });
  $("loadBtn")?.addEventListener("click", () => { loadDraft(); showMessage("success","Draft loaded."); });
  $("clearDraftBtn")?.addEventListener("click", () => { clearDraft(); showMessage("success","Draft cleared."); });
}

// ---------- Resume file upload → /api/extract ----------
function wireUpload() {
  const uploadBtn = $("uploadBtn");
  const resumeFileInput = $("resumeFile");
  if (!uploadBtn || !resumeFileInput) return;

  uploadBtn.addEventListener("click", () => resumeFileInput.click());

  resumeFileInput.addEventListener("change", async () => {
    const file = resumeFileInput.files?.[0];
    if (!file) { showMessage("warn", "No file selected."); return; }

    const formData = new FormData();
    formData.append("file", file); // MUST be 'file' key for backend

    try {
      showMessage("info", "Extracting text from file…");
      const r = await fetch("/api/extract", { method: "POST", body: formData });
      if (!r.ok) throw new Error(await r.text());
      const data = await r.json();
      const resumeEl = getResumeEl();
      if (resumeEl) resumeEl.value = data.text || "";

      // Update counter and autosave
      const rc = $("resumeCount");
      if (rc && resumeEl) updateCounterFrom(resumeEl, rc);
      saveDraft();

      showMessage("success", "File text extracted and added to your resume.");
    } catch (err) {
      showMessage("error", friendlyError(err));
    } finally {
      resumeFileInput.value = ""; // allow re-selecting same file
    }
  });
}

// ---------- Init ----------
document.addEventListener("DOMContentLoaded", () => {
  // Counters and draft
  wireCounters();
  wireAutosave();
  loadDraft();                 // silent restore on refresh
  maybeOfferLoadDraftBanner(); // polite banner (keeps silent restore too)

  // Buttons / actions
  wireAnalyze();
  wireRewrite();
  wireCopy();
  wireDownload();
  wireClear();
  wireDraftButtons();
  wireUpload();

  // Usage counter on load
  initUsageIfNeeded();
  updateUsageCounter();
});