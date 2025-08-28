// ================================
// Resume Optimizer — script.js (Lessons 1–15)
// ================================

// ---------- Config ----------
const BASE_REWRITES_PER_DAY = 5;
const EMAIL_BONUS_REWRITES = 5;          // becomes 10/day after email
const AUTOSAVE_DEBOUNCE_MS = 400;

// ---- LocalStorage keys
const LS_KEYS = {
  resume: "ro.resume",
  jd: "ro.jd",
  savedAt: "ro.savedAt",
  usedDate: "ro.usedDate",
  usedCount: "ro.usedCount",
  emailProvided: "ro.emailProvided",
  emailAddress: "ro.emailAddress",
};

// ---------- Utilities ----------
function debounce(fn, wait = 300) {
  let t;
  return (...args) => {
    clearTimeout(t);
    t = setTimeout(() => fn(...args), wait);
  };
}

function withLoading(btn, labelWhileLoading, fn) {
  return async function (...args) {
    let originalHTML;
    if (btn) {
      btn.disabled = true;
      originalHTML = btn.innerHTML;
      btn.innerHTML = `<span class="spinner"></span>${labelWhileLoading}`;
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

function spinnerHTML(text = "Working…") {
  return `<span class="spinner"></span>${text}`;
}

function friendlyError(err) {
  try {
    if (typeof err === "string") return err;
    if (err?.message) {
      // Try to unwrap JSON-ish server messages
      const m = err.message;
      if (m.includes("rate_limit")) return "We’re temporarily at capacity. Please try again shortly.";
      if (m.includes("invalid_api_key")) return "Server auth error. Please try again later.";
      if (m.includes("ECONN") || m.includes("NetworkError")) return "Network issue. Check your connection and retry.";
      // Vercel function wrapper messages
      if (/FUNCTION_INVOCATION_FAILED/i.test(m)) return "A server error occurred. Please try again.";
      return m;
    }
  } catch (_) {}
  return "Something went wrong. Please try again.";
}

// ---------- Simple alert messaging ----------
function showMessage(type, text) {
  // types: info | success | warn | error
  let box = document.getElementById("messages");
  if (!box) box = document.getElementById("summary"); // fallback
  if (!box) return;

  const div = document.createElement("div");
  div.className = `alert ${type}`;
  div.textContent = text;
  box.prepend(div);

  setTimeout(() => {
    if (div && div.parentNode) div.parentNode.removeChild(div);
  }, 5000);
}

function clearMessages() {
  const box = document.getElementById("messages");
  if (box) box.innerHTML = "";
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

// ---------- Usage limits (per day) ----------
function getTodayKey() {
  const d = new Date();
  return d.toISOString().slice(0, 10); // YYYY-MM-DD
}
function getMaxPerDay() {
  const bonus = localStorage.getItem(LS_KEYS.emailProvided) === "true" ? EMAIL_BONUS_REWRITES : 0;
  return BASE_REWRITES_PER_DAY + bonus;
}
function getRewritesUsed() {
  const today = getTodayKey();
  const usedDate = localStorage.getItem(LS_KEYS.usedDate);
  if (usedDate !== today) return 0;
  return parseInt(localStorage.getItem(LS_KEYS.usedCount) || "0", 10);
}
function incrementRewrites() {
  const today = getTodayKey();
  const usedDate = localStorage.getItem(LS_KEYS.usedDate);
  let count = getRewritesUsed();
  if (usedDate !== today) count = 0;
  count += 1;
  localStorage.setItem(LS_KEYS.usedDate, today);
  localStorage.setItem(LS_KEYS.usedCount, String(count));
  updateUsageCounter();
}
function updateUsageCounter() {
  const el = document.getElementById("usageCounter");
  if (el) el.textContent = `${getRewritesUsed()} / ${getMaxPerDay()} rewrites used today`;
}

// ---------- Email gate (when limit exceeded) ----------
function renderEmailModal() {
  const wrap = document.createElement("div");
  wrap.id = "email-modal";
  wrap.innerHTML = `
    <div class="modal-backdrop"></div>
    <div class="modal">
      <h3>Get 5 extra rewrites/day</h3>
      <p>Enter your email to extend today’s limit from ${BASE_REWRITES_PER_DAY} to ${BASE_REWRITES_PER_DAY + EMAIL_BONUS_REWRITES}.</p>
      <form id="emailForm" class="modal-form">
        <input type="email" id="emailInput" placeholder="you@example.com" required />
        <div class="modal-actions">
          <button type="submit" class="ai-btn">Unlock</button>
          <button type="button" id="emailCancel" class="secondary">Cancel</button>
        </div>
      </form>
    </div>
  `;
  document.body.appendChild(wrap);

  wrap.querySelector("#emailCancel")?.addEventListener("click", () => {
    wrap.remove();
  });

  wrap.querySelector("#emailForm")?.addEventListener("submit", (e) => {
    e.preventDefault();
    const input = wrap.querySelector("#emailInput");
    const email = (input?.value || "").trim();
    if (!email || !/^\S+@\S+\.\S+$/.test(email)) {
      showMessage("warn", "Please enter a valid email.");
      return;
    }
    localStorage.setItem(LS_KEYS.emailProvided, "true");
    localStorage.setItem(LS_KEYS.emailAddress, email);
    updateUsageCounter();
    showMessage("success", "Thanks! Your daily limit is now 10.");
    wrap.remove();
  });
}

function ensureLimitOrPrompt() {
  const used = getRewritesUsed();
  if (used >= getMaxPerDay()) {
    // If not yet provided, ask for email to unlock more
    if (localStorage.getItem(LS_KEYS.emailProvided) !== "true") {
      renderEmailModal();
    } else {
      showMessage("warn", "Daily limit reached. Please come back tomorrow.");
    }
    return false;
  }
  return true;
}

// ---------- Draft save/load helpers ----------
function saveDraft() {
  const resumeEl = document.getElementById("resume");
  const jdEl = document.getElementById("jobDesc") || document.getElementById("jd");
  if (!resumeEl || !jdEl) return;

  localStorage.setItem(LS_KEYS.resume, resumeEl.value || "");
  localStorage.setItem(LS_KEYS.jd, jdEl.value || "");
  localStorage.setItem(LS_KEYS.savedAt, new Date().toISOString());
  showMessage("success", "Draft saved.");
}

function loadDraft() {
  const resumeEl = document.getElementById("resume");
  const jdEl = document.getElementById("jobDesc") || document.getElementById("jd");
  if (!resumeEl || !jdEl) return;

  const resume = localStorage.getItem(LS_KEYS.resume) || "";
  const jd = localStorage.getItem(LS_KEYS.jd) || "";
  resumeEl.value = resume;
  jdEl.value = jd;

  // Refresh counters
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
}

function clearDraft() {
  localStorage.removeItem(LS_KEYS.resume);
  localStorage.removeItem(LS_KEYS.jd);
  localStorage.removeItem(LS_KEYS.savedAt);
}

// ---- Draft presence + timestamp helpers (Lesson 15 polished UX) ---
function hasDraft() {
  return !!(localStorage.getItem(LS_KEYS.resume) || localStorage.getItem(LS_KEYS.jd));
}
function lastSavedAtText() {
  const when = localStorage.getItem(LS_KEYS.savedAt);
  return when ? new Date(when).toLocaleString() : null;
}

// ---- Inject "Restore draft?" banner if appropriate
function maybeOfferDraftRestore() {
  const resumeEl = document.getElementById("resume");
  const jdEl = document.getElementById("jobDesc") || document.getElementById("jd");
  if (!resumeEl || !jdEl) return;

  // Show only if a draft exists AND both fields are empty
  const draftExists = hasDraft();
  const bothEmpty = !(resumeEl.value?.trim()) && !(jdEl.value?.trim());
  if (!draftExists || !bothEmpty) return;

  const messages = document.getElementById("messages") || document.body;
  const wrap = document.createElement("div");
  wrap.className = "alert info";
  const ts = lastSavedAtText();
  wrap.innerHTML = `
    <strong>Restore draft?</strong>
    ${ts ? `<span style="opacity:.85">Saved ${ts}.</span>` : ""}
    <div style="margin-top:8px; display:flex; gap:8px; flex-wrap:wrap;">
      <button id="draftRestoreBtn" class="secondary">Load saved draft</button>
      <button id="draftDismissBtn" class="secondary">Dismiss</button>
    </div>
  `;
  messages.prepend(wrap);

  wrap.querySelector("#draftRestoreBtn")?.addEventListener("click", () => {
    loadDraft();
    wrap.remove();
  });
  wrap.querySelector("#draftDismissBtn")?.addEventListener("click", () => {
    wrap.remove();
  });
}

// ---- Unsaved changes warning
(function warnOnUnsavedChanges() {
  const resumeEl = document.getElementById("resume");
  const jdEl = document.getElementById("jobDesc") || document.getElementById("jd");
  if (!resumeEl || !jdEl) return;

  function isDirty() {
    const savedResume = localStorage.getItem(LS_KEYS.resume) || "";
    const savedJd = localStorage.getItem(LS_KEYS.jd) || "";
    return (resumeEl.value || "") !== savedResume || (jdEl.value || "") !== savedJd;
  }

  window.addEventListener("beforeunload", (e) => {
    if (isDirty()) {
      e.preventDefault();
      e.returnValue = "";
    }
  });
})();

// ---------- API helpers ----------
async function callAnalyzeAPI(resume, jobDesc) {
  const r = await fetch("/api/analyze", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ resume, jobDesc })
  });
  if (!r.ok) throw new Error(await r.text());
  return r.json(); // { analysis: string }
}

async function callRewriteAPI(resume, jobDesc, opts = {}) {
  const r = await fetch("/api/rewrite", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      resume,
      jd: jobDesc,
      tone: (opts.tone || "").toLowerCase(),
      seniority: (opts.seniority || "").toLowerCase(),
      role: (opts.role || "").toLowerCase(),
    })
  });
  if (!r.ok) throw new Error(await r.text());
  const data = await r.json(); // { bullets: string | string[] }
  let bulletsText = "";
  if (Array.isArray(data.bullets)) bulletsText = data.bullets.join("\n");
  else bulletsText = data.bullets || "";
  return bulletsText;
}

// ---------- Analyze Alignment (server) ----------
const analyzeBtn = document.getElementById("analyzeBtn");
if (analyzeBtn) {
  const handler = withLoading(analyzeBtn, "Analyzing…", async () => {
    clearMessages();
    const resume = (document.getElementById("resume")?.value || "").trim();
    const jobDesc = (
      document.getElementById("jobDesc")?.value ||
      document.getElementById("jd")?.value ||
      ""
    ).trim();

    if (!resume || !jobDesc) {
      showMessage("warn", "Please paste both Resume and Job Description.");
      return;
    }

    const summary = document.getElementById("summary");
    if (summary) summary.innerHTML = spinnerHTML("Analyzing alignment…");

    try {
      const data = await callAnalyzeAPI(resume, jobDesc);
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
      if (summary) summary.innerHTML = "";
      showMessage("error", friendlyError(err));
    }
  });

  analyzeBtn.addEventListener("click", handler);
}

// ---------- Rewrite (server, with limits + email gate) ----------
const rewriteBtn = document.getElementById("rewriteBtn");
if (rewriteBtn) {
  const handler = withLoading(rewriteBtn, "Rewriting…", async () => {
    clearMessages();
    if (!ensureLimitOrPrompt()) return;

    const resume = (document.getElementById("resume")?.value || "").trim();
    const jobDesc = (
      document.getElementById("jobDesc")?.value ||
      document.getElementById("jd")?.value ||
      ""
    ).trim();
    if (!resume || !jobDesc) {
      showMessage("warn", "Please paste both Resume and Job Description.");
      return;
    }

    const tone = (document.getElementById("tone")?.value || "Professional");
    const seniority = (document.getElementById("seniority")?.value || "Mid");
    const role = (document.getElementById("role")?.value || "General");

    const summary = document.getElementById("summary");
    if (summary) summary.innerHTML = spinnerHTML("Rewriting with AI…");

    try {
      const bullets = await callRewriteAPI(resume, jobDesc, { tone, seniority, role });

      // normalize to list items
      const html = bullets
        .split("\n")
        .map((l) => l.trim())
        .filter(Boolean)
        .map((l) => l.replace(/^[-•*\d.)\s]+/, ""))
        .map((l) => `<li>${l}</li>`)
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
      showMessage(
        "success",
        `AI rewrite complete. (${getRewritesUsed()}/${getMaxPerDay()} used today)`
      );
    } catch (err) {
      if (summary) summary.innerHTML = "";
      showMessage("error", friendlyError(err));
    }
  });

  rewriteBtn.addEventListener("click", handler);
}

// ---------- Copy + Download ----------
function getCurrentBullets() {
  const summary = document.getElementById("summary");
  const lis = summary ? summary.querySelectorAll("li") : [];
  return Array.from(lis).map((li) => li.textContent.trim()).filter(Boolean);
}

// Copy
const copyBtn = document.getElementById("copyBtn");
if (copyBtn) {
  copyBtn.addEventListener("click", async () => {
    const bullets = getCurrentBullets();
    if (!bullets.length) {
      showMessage("warn", "No AI bullets to copy yet!");
      return;
    }
    try {
      await navigator.clipboard.writeText(bullets.join("\n"));
      showMessage("success", "Copied AI bullets to your clipboard.");
    } catch (err) {
      showMessage("error", friendlyError(err));
    }
  });
}

// Download DOCX (server)
const downloadBtn = document.getElementById("downloadBtn");
if (downloadBtn) {
  const handler = withLoading(downloadBtn, "Preparing DOCX…", async () => {
    const bullets = getCurrentBullets();
    if (!bullets.length) {
      showMessage("warn", "No AI bullets to download yet!");
      return;
    }

    try {
      const r = await fetch("/api/download-docx", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title: "AI Suggested Resume Bullets",
          bullets
        })
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

// ---------- Resume file upload → /api/extract ----------
const uploadBtn = document.getElementById("uploadBtn");
const resumeFileInput = document.getElementById("resumeFile");

if (uploadBtn && resumeFileInput) {
  // open hidden file input
  uploadBtn.addEventListener("click", () => resumeFileInput.click());

  // send chosen file to backend
  resumeFileInput.addEventListener("change", async () => {
    const file = resumeFileInput.files?.[0];
    if (!file) {
      showMessage("warn", "No file selected.");
      return;
    }

    const formData = new FormData();
    formData.append("file", file); // key MUST be "file"

    // temporarily put uploadBtn into loading state
    let originalHTML = uploadBtn.innerHTML;
    uploadBtn.disabled = true;
    uploadBtn.innerHTML = `<span class="spinner"></span>Uploading…`;

    try {
      showMessage("info", "Extracting text from file…");
      const r = await fetch("/api/extract", { method: "POST", body: formData });
      if (!r.ok) throw new Error(await r.text());
      const data = await r.json();

      const resumeEl = document.getElementById("resume");
      if (resumeEl) resumeEl.value = data.text || "";

      const resumeCount = document.getElementById("resumeCount");
      if (resumeEl && resumeCount) updateCounterFrom(resumeEl, resumeCount);

      showMessage("success", "File text extracted and added to your resume.");
    } catch (err) {
      showMessage("error", friendlyError(err));
    } finally {
      uploadBtn.disabled = false;
      uploadBtn.innerHTML = originalHTML;
      // allow re-selecting same file
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
    clearDraft();

    const resumeCount = document.getElementById("resumeCount");
    if (resumeCount) resumeCount.textContent = "0 characters";
    const jobDescCount = document.getElementById("jobDescCount");
    if (jobDescCount) jobDescCount.textContent = "0 characters";

    showMessage("info", "Cleared. Paste your fresh text to continue.");
  });
}

// ---------- Optional Draft buttons (only if present in HTML) ----------
const saveBtn = document.getElementById("saveBtn");
if (saveBtn) saveBtn.addEventListener("click", saveDraft);

const loadBtn = document.getElementById("loadBtn");
if (loadBtn) loadBtn.addEventListener("click", loadDraft);

const clearDraftBtn = document.getElementById("clearDraftBtn");
if (clearDraftBtn) clearDraftBtn.addEventListener("click", () => {
  clearDraft();
  showMessage("success", "Draft cleared.");
});

// ---------- Autosave wiring ----------
(function wireAutosave() {
  const resumeEl = document.getElementById("resume");
  const jdEl = document.getElementById("jobDesc") || document.getElementById("jd");
  if (!resumeEl || !jdEl) return;
  const debounced = debounce(saveDraft, AUTOSAVE_DEBOUNCE_MS);
  resumeEl.addEventListener("input", debounced);
  jdEl.addEventListener("input", debounced);
})();

// ---------- On load ----------
document.addEventListener("DOMContentLoaded", () => {
  wireCounters();
  updateUsageCounter();
  maybeOfferDraftRestore(); // polished restore flow
});