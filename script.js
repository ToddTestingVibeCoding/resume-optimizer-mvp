// ================================
// Resume Optimizer - script.js (Lesson 14+)
// Production build: autosave drafts + persist usage
// ================================

// ---------- Config ----------
const BASE_REWRITES_PER_DAY = 5;
const EMAIL_BONUS_REWRITES = 5; // if user provides email, total becomes 10/day
const AUTOSAVE_DEBOUNCE_MS = 400;

// ---------- Utilities ----------
const STOPWORDS = new Set([
  "the","and","or","to","a","of","in","for","b","on","with","is","are","as","at","by",
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
    `Add a bullet using “${term}” in context (e.g., quantified impact or tool usage).`
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

function debounce(fn, wait) {
  let t;
  return (...args) => {
    clearTimeout(t);
    t = setTimeout(() => fn(...args), wait);
  };
}

// ---------- Messaging & UI helpers ----------
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
function friendlyError(err) {
  const raw = (err && (err.message || err.detail || err.toString())) || "Something went wrong.";
  const msg = String(raw);
  if (/rate limit/i.test(msg)) return "We’re at capacity for a moment. Please try again shortly.";
  if (/invalid_api_key|Incorrect API key/i.test(msg)) return "Server API key is misconfigured. Try again later.";
  if (/FUNCTION_INVOCATION_FAILED/i.test(msg)) return "Server function had an issue. Please retry.";
  if (/timeout/i.test(msg)) return "Request timed out. Please try again.";
  return msg;
}
function withLoading(btn, label, fn) {
  return async function(...args) {
    let original;
    if (btn) { original = btn.innerHTML; btn.disabled = true; btn.innerHTML = label; }
    try { return await fn(...args); }
    finally { if (btn) { btn.disabled = false; btn.innerHTML = original; } }
  };
}
function spinnerHTML(text = "Working…") {
  return `<span class="spinner"></span>${text}`;
}

// ---------- Local Storage (Lesson 14) ----------
const LS_KEYS = {
  resume: "resumeText",
  jobDesc: "jobDescText",
  tone: "toneValue",
  seniority: "seniorityValue",
  role: "roleValue",
  rewritesUsed: "rewritesUsed",
  rewritesDate: "rewritesDate",
  email: "userEmail"
};

function todayStr() { return new Date().toISOString().slice(0,10); }

function getUserEmail() { return localStorage.getItem(LS_KEYS.email) || ""; }
function setUserEmail(email) { localStorage.setItem(LS_KEYS.email, email); }

function maxDailyRewrites() {
  return getUserEmail() ? (BASE_REWRITES_PER_DAY + EMAIL_BONUS_REWRITES) : BASE_REWRITES_PER_DAY;
}
function getRewritesUsed() {
  const d = localStorage.getItem(LS_KEYS.rewritesDate);
  const used = parseInt(localStorage.getItem(LS_KEYS.rewritesUsed) || "0", 10);
  if (d !== todayStr()) {
    localStorage.setItem(LS_KEYS.rewritesDate, todayStr());
    localStorage.setItem(LS_KEYS.rewritesUsed, "0");
    return 0;
  }
  return isNaN(used) ? 0 : used;
}
function incrementRewrites() {
  const d = localStorage.getItem(LS_KEYS.rewritesDate);
  if (d !== todayStr()) {
    localStorage.setItem(LS_KEYS.rewritesDate, todayStr());
    localStorage.setItem(LS_KEYS.rewritesUsed, "1");
    return 1;
  }
  const next = getRewritesUsed() + 1;
  localStorage.setItem(LS_KEYS.rewritesUsed, String(next));
  return next;
}
function updateUsageCounter() {
  const el = document.getElementById("usageCounter");
  if (el) el.textContent = `${getRewritesUsed()} / ${maxDailyRewrites()} rewrites used today`;
}

// Restore controls and editors from storage
function restoreDrafts() {
  const resumeEl = document.getElementById("resume");
  const jobDescEl = document.getElementById("jobDesc") || document.getElementById("jd");
  const toneEl = document.getElementById("tone");
  const seniorityEl = document.getElementById("seniority");
  const roleEl = document.getElementById("role");

  if (resumeEl) resumeEl.value = localStorage.getItem(LS_KEYS.resume) || resumeEl.value || "";
  if (jobDescEl) jobDescEl.value = localStorage.getItem(LS_KEYS.jobDesc) || jobDescEl.value || "";
  if (toneEl && localStorage.getItem(LS_KEYS.tone)) toneEl.value = localStorage.getItem(LS_KEYS.tone);
  if (seniorityEl && localStorage.getItem(LS_KEYS.seniority)) seniorityEl.value = localStorage.getItem(LS_KEYS.seniority);
  if (roleEl && localStorage.getItem(LS_KEYS.role)) roleEl.value = localStorage.getItem(LS_KEYS.role);
}

// Debounced autosave for editors/controls
const debouncedSaveResume = debounce((val)=> localStorage.setItem(LS_KEYS.resume, val || ""), AUTOSAVE_DEBOUNCE_MS);
const debouncedSaveJob = debounce((val)=> localStorage.setItem(LS_KEYS.jobDesc, val || ""), AUTOSAVE_DEBOUNCE_MS);
const debouncedSaveTone = debounce((val)=> localStorage.setItem(LS_KEYS.tone, val || ""), AUTOSAVE_DEBOUNCE_MS);
const debouncedSaveSeniority = debounce((val)=> localStorage.setItem(LS_KEYS.seniority, val || ""), AUTOSAVE_DEBOUNCE_MS);
const debouncedSaveRole = debounce((val)=> localStorage.setItem(LS_KEYS.role, val || ""), AUTOSAVE_DEBOUNCE_MS);

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

// ensure it runs
wireCounters();
// (or) document.addEventListener("DOMContentLoaded", wireCounters);

// ---------- Email modal (unlock bonus rewrites) ----------
let pendingAction = null;

function openEmailModal(next) {
  const modal = document.getElementById("emailModal");
  if (!modal) return;
  pendingAction = typeof next === "function" ? next : null;
  modal.classList.add("open");
  const input = document.getElementById("emailInput");
  if (input) input.focus();
}
function closeEmailModal() {
  const modal = document.getElementById("emailModal");
  if (modal) modal.classList.remove("open");
  pendingAction = null;
}
function isValidEmail(s) { return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test((s||"").trim()); }

(function wireEmailModal(){
  const cancel = document.getElementById("emailCancel");
  const confirm = document.getElementById("emailConfirm");
  const input = document.getElementById("emailInput");
  if (cancel) cancel.addEventListener("click", closeEmailModal);
  if (confirm) confirm.addEventListener("click", () => {
    const email = input ? input.value.trim() : "";
    if (!isValidEmail(email)) { showMessage("warn","Please enter a valid email."); return; }
    setUserEmail(email);
    updateUsageCounter();
    showMessage("success", "Thanks! You’ve unlocked extra rewrites.");
    closeEmailModal();
    if (pendingAction) { const next = pendingAction; pendingAction = null; next(); }
  });
})();

// ---------- Analyze (no AI client-side) ----------
const analyzeBtn = document.getElementById("analyzeBtn");
if (analyzeBtn) {
  const handler = withLoading(analyzeBtn, "Analyzing…", async () => {
    const resume = (document.getElementById("resume")?.value || "").trim();
    const jdEl = document.getElementById("jobDesc") || document.getElementById("jd");
    const jobDesc = (jdEl?.value || "").trim();
    if (!resume || !jobDesc) { showMessage("warn", "Please paste both Resume and Job Description."); return; }

    try {
      const r = await fetch("/api/analyze", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ resume, jobDesc })
      });
      if (!r.ok) throw new Error(await r.text());
      const data = await r.json();

      const summary = document.getElementById("summary");
      if (summary) {
        summary.innerHTML = `
          <div class="card">
            <h3>Alignment Analysis</h3>
            <p>${(data.analysis || "").replace(/\n/g, "<br>")}</p>
          </div>
        `;
      }
      showMessage("success", "Alignment analysis complete.");
    } catch (err) {
      showMessage("error", friendlyError(err));
    }
  });
  analyzeBtn.addEventListener("click", handler);
}

// ---------- Rewrite (AI backend) ----------
async function callRewriteAPI(resume, jd, opts = {}) {
  const r = await fetch("/api/rewrite", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ resume, jd, options: opts })
  });
  if (!r.ok) throw new Error(await r.text());
  const data = await r.json();
  return data.bullets || "";
}
const rewriteBtn = document.getElementById("rewriteBtn");
if (rewriteBtn) {
  const handler = withLoading(rewriteBtn, "Rewriting…", async () => {
    const resume = (document.getElementById("resume")?.value || "").trim();
    const jdEl = document.getElementById("jobDesc") || document.getElementById("jd");
    const jd = (jdEl?.value || "").trim();
    const summary = document.getElementById("summary");
    if (!resume || !jd) { showMessage("warn", "Please paste both Resume and Job Description first."); return; }

    // Enforce daily limits
    const used = getRewritesUsed();
    const max = maxDailyRewrites();
    if (used >= max) {
      if (!getUserEmail() && used >= BASE_REWRITES_PER_DAY) {
        // Ask for email to unlock bonus; then retry the click.
        openEmailModal(() => rewriteBtn.click());
        return;
      }
      showMessage("warn", "Daily limit reached. Please come back tomorrow.");
      return;
    }

    // Preferences from Lesson 7
    const tone = (document.getElementById("tone")?.value || "Professional").toLowerCase();
    const seniority = (document.getElementById("seniority")?.value || "Mid").toLowerCase();
    const role = (document.getElementById("role")?.value || "General").toLowerCase();

    if (summary) summary.innerHTML = spinnerHTML("Rewriting with AI…");

    try {
      const bullets = await callRewriteAPI(resume, jd, { tone, seniority, role });
      const html = bullets
        .split("\n")
        .map(l => l.trim())
        .filter(Boolean)
        .map(l => l.replace(/^[-•*\d.)\s]+/, ""))
        .map(l => `<li>${l}</li>`)
        .join("");
      if (summary) summary.innerHTML = `<div class="card"><h3>AI Suggested Bullets</h3><ul>${html}</ul></div>`;
      incrementRewrites();
      updateUsageCounter();
      showMessage("success", `AI rewrite complete. (${getRewritesUsed()}/${maxDailyRewrites()} used today)`);
    } catch (e) {
      if (summary) summary.innerHTML = "";
      showMessage("error", friendlyError(e));
    }
  });
  rewriteBtn.addEventListener("click", handler);
}

// ---------- Copy + Download ----------
function getCurrentBullets() {
  const summary = document.getElementById("summary");
  const lis = summary ? summary.querySelectorAll("li") : [];
  return Array.from(lis).map(li => li.textContent.trim()).filter(Boolean);
}
const copyBtn = document.getElementById("copyBtn");
if (copyBtn) {
  const handler = withLoading(copyBtn, "Copying…", async () => {
    const bullets = getCurrentBullets();
    if (!bullets.length) { showMessage("warn","No AI bullets to copy yet!"); return; }
    try {
      await navigator.clipboard.writeText(bullets.join("\n"));
      showMessage("success","Copied AI bullets to your clipboard.");
    } catch (err) {
      showMessage("error","Copy failed: " + (err?.message || err));
    }
  });
  copyBtn.addEventListener("click", handler);
}

const downloadBtn = document.getElementById("downloadBtn");
if (downloadBtn) {
  const handler = withLoading(downloadBtn, "Preparing DOCX…", async () => {
    const bullets = getCurrentBullets();
    if (!bullets.length) { showMessage("warn","No AI bullets to download yet!"); return; }
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
      showMessage("success","Downloaded DOCX. Open it in Word/Pages.");
    } catch (e) {
      showMessage("error", friendlyError(e));
    }
  });
  downloadBtn.addEventListener("click", handler);
}

// ---------- Upload (extract) ----------
const uploadBtn = document.getElementById("uploadBtn");
const resumeFileInput = document.getElementById("resumeFile");
if (uploadBtn && resumeFileInput) {
  uploadBtn.addEventListener("click", () => resumeFileInput.click());
  resumeFileInput.addEventListener("change", async () => {
    const file = resumeFileInput.files?.[0];
    if (!file) { showMessage("warn","No file selected."); return; }

    const formData = new FormData();
    formData.append("file", file);

    const original = uploadBtn.innerHTML;
    uploadBtn.disabled = true;
    uploadBtn.innerHTML = "Uploading…";

    try {
      showMessage("info","Extracting text from file…");
      const r = await fetch("/api/extract", { method: "POST", body: formData });
      if (!r.ok) throw new Error(await r.text());
      const data = await r.json();
      const resumeEl = document.getElementById("resume");
      if (resumeEl) {
        resumeEl.value = data.text || "";
        localStorage.setItem(LS_KEYS.resume, resumeEl.value);
        const resumeCount = document.getElementById("resumeCounter");
        if (resumeCount) updateCounterFrom(resumeEl, resumeCount);
      }
      showMessage("success","File text extracted and added to your resume.");
    } catch (err) {
      showMessage("error", friendlyError(err));
    } finally {
      uploadBtn.disabled = false;
      uploadBtn.innerHTML = original;
      resumeFileInput.value = "";
    }
  });
}

// ---------- Clear ----------
const clearBtn = document.getElementById("clearBtn");
if (clearBtn) {
  clearBtn.addEventListener("click", () => {
    const ids = ["resume", "jobDesc", "jd", "summary"];
    for (const id of ids) {
      const el = document.getElementById(id);
      if (!el) continue;
      if (el.tagName === "TEXTAREA" || el.tagName === "INPUT") el.value = "";
      else el.innerHTML = "";
    }
    localStorage.removeItem(LS_KEYS.resume);
    localStorage.removeItem(LS_KEYS.jobDesc);
    const resumeCount = document.getElementById("resumeCounter");
    if (resumeCount) resumeCount.textContent = "0 characters";
    const jdCount = document.getElementById("jdCounter") || document.getElementById("jobDescCounter");
    if (jdCount) jdCount.textContent = "0 characters";
    showMessage("info", "Cleared. Paste your fresh text to continue.");
  });
}

// ---------- Wire autosave on inputs ----------
(function wireAutosave(){
  const resumeEl = document.getElementById("resume");
  const jobDescEl = document.getElementById("jobDesc") || document.getElementById("jd");
  const toneEl = document.getElementById("tone");
  const seniorityEl = document.getElementById("seniority");
  const roleEl = document.getElementById("role");

  if (resumeEl) resumeEl.addEventListener("input", () => debouncedSaveResume(resumeEl.value));
  if (jobDescEl) jobDescEl.addEventListener("input", () => debouncedSaveJob(jobDescEl.value));
  if (toneEl) toneEl.addEventListener("change", () => debouncedSaveTone(toneEl.value));
  if (seniorityEl) seniorityEl.addEventListener("change", () => debouncedSaveSeniority(seniorityEl.value));
  if (roleEl) roleEl.addEventListener("change", () => debouncedSaveRole(roleEl.value));
})();

// ---------- Init on load ----------
(function init(){
  restoreDrafts();
  wireCounters();
  // Ensure daily usage is on today's date
  if (localStorage.getItem(LS_KEYS.rewritesDate) !== todayStr()) {
    localStorage.setItem(LS_KEYS.rewritesDate, todayStr());
    localStorage.setItem(LS_KEYS.rewritesUsed, "0");
  }
  updateUsageCounter();
})();