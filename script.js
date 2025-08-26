// ================================
// Resume Optimizer - script.js (Lessons 6–10)
// Production-ready front-end
// ================================

// ---------- Simple alert messaging ----------
function showMessage(type, text) {
  // types: info | success | warn | error
  let box = document.getElementById("messages");
  if (!box) {
    // fallback: use summary area to display messages at top
    box = document.getElementById("summary");
  }
  if (!box) return;
  const div = document.createElement("div");
  div.className = `alert ${type}`;
  div.textContent = text;
  box.prepend(div);
  // auto-remove after 5s
  setTimeout(() => {
    if (div && div.parentNode) div.parentNode.removeChild(div);
  }, 5000);
}

// --- Friendly error mapping ---
function friendlyError(err) {
  try {
    // Strings or Error objects
    const raw = typeof err === "string" ? err : (err?.message || "");
    if (!raw) return "Something went wrong. Please try again.";

    // Common API problems
    if (/invalid_api_key|Incorrect API key/i.test(raw)) {
      return "API key issue: check your OpenAI key in Vercel → Settings → Environment Variables.";
    }
    if (/rate[_\s-]?limit|rpm|requests per min/i.test(raw)) {
      return "We’re hitting a rate limit. Please wait ~30–60 seconds and try again.";
    }
    if (/model.*not.*found|unsupported.*model/i.test(raw)) {
      return "The selected AI model isn’t available. We’ll switch models on the backend.";
    }
    if (/FUNCTION_INVOCATION_FAILED|vercel/i.test(raw)) {
      return "The server function failed to run. Try again in a moment.";
    }
    if (/413|payload too large/i.test(raw)) {
      return "That file or text is too large to process. Try a smaller file or trim the text.";
    }
    if (/415|unsupported media/i.test(raw)) {
      return "That file type isn’t supported. Please upload a .docx, .pdf, or .txt file.";
    }
    if (/No file uploaded/i.test(raw)) {
      return "No file was received. Pick a .docx, .pdf, or .txt with the Upload button.";
    }

    // Sometimes server sends JSON; try to extract message
    try {
      const asJSON = JSON.parse(raw);
      if (asJSON?.error?.message) return asJSON.error.message;
      if (asJSON?.detail?.error?.message) return asJSON.detail.error.message;
      if (asJSON?.detail) return String(asJSON.detail);
      if (asJSON?.error) return String(asJSON.error);
    } catch (_) {}

    // Fallback: show trimmed error
    return raw.replace(/["{}\\]+/g, "").slice(0, 240);
  } catch (_) {
    return "Unexpected error. Please try again.";
  }
}

function spinnerHTML(text = "Working…") {
  return `<span class="spinner"></span>${text}`;
}

// ---------- Rewrite usage counter (daily limit) ----------
const MAX_REWRITES_PER_DAY = 5;
const USAGE_KEY = "rewritesUsed";
const USAGE_DATE_KEY = "rewritesDate";

function todayKey() {
  const d = new Date();
  return `${d.getFullYear()}-${d.getMonth() + 1}-${d.getDate()}`;
}

function getRewritesUsed() {
  const storedDate = localStorage.getItem(USAGE_DATE_KEY);
  if (storedDate !== todayKey()) {
    // reset on new day
    localStorage.setItem(USAGE_DATE_KEY, todayKey());
    localStorage.setItem(USAGE_KEY, "0");
  }
  return parseInt(localStorage.getItem(USAGE_KEY) || "0", 10);
}

function setRewritesUsed(n) {
  localStorage.setItem(USAGE_DATE_KEY, todayKey());
  localStorage.setItem(USAGE_KEY, String(n));
}

function incrementRewrites() {
  setRewritesUsed(getRewritesUsed() + 1);
}

function updateUsageCounter() {
  const el = document.getElementById("usageCounter");
  if (el) el.textContent = `${getRewritesUsed()} / ${MAX_REWRITES_PER_DAY} rewrites used today`;
}
updateUsageCounter();

/* --- Character counters (Lesson 11) --- */
function updateCharCount(textareaId, counterId) {
  const ta = document.getElementById(textareaId);
  const out = document.getElementById(counterId);
  if (!ta || !out) return;
  const len = (ta.value || "").length;
  out.textContent = `${len.toLocaleString()} characters`;
}
function wireCharCounters() {
  const pairs = [
    ["resume", "resumeCount"],
    ["jd", "jdCount"],
    ["jobDesc", "jdCount"], // fallback if your JD field uses id="jobDesc"
  ];
  for (const [taId, outId] of pairs) {
    const ta = document.getElementById(taId);
    if (!ta) continue;
    const handler = () => updateCharCount(taId, outId);
    ta.addEventListener("input", handler);
    handler(); // initialize immediately
  }
}
document.addEventListener("DOMContentLoaded", wireCharCounters);

// ---------- Loading helpers ----------
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

// ---------- Utilities ----------
function getCurrentBullets() {
  const summary = document.getElementById("summary");
  const lis = summary ? summary.querySelectorAll("li") : [];
  return Array.from(lis).map(li => li.textContent.trim()).filter(Boolean);
}

// ==============================
// Upload: Resume → /api/extract
// ==============================
// ---------- Resume file upload → /api/extract (with spinner on button) ----------
const uploadBtn = document.getElementById("uploadBtn");
const resumeFileInput = document.getElementById("resumeFile");

if (uploadBtn && resumeFileInput) {
  // Clicking the visible button opens the hidden file picker
  uploadBtn.addEventListener("click", () => resumeFileInput.click());

  // When a file is chosen, send it to the backend
  resumeFileInput.addEventListener("change", async () => {
    const file = resumeFileInput.files?.[0];
    if (!file) {
      showMessage("warn", "No file selected.");
      return;
    }

    // Show spinner on the visible Upload button during the request
    let originalHTML = uploadBtn.innerHTML;
    uploadBtn.disabled = true;
    uploadBtn.innerHTML = spinnerHTML("Uploading…");

    const formData = new FormData();
    // IMPORTANT: key must be "file" (backend expects this)
    formData.append("file", file);

    try {
      showMessage("info", "Extracting text from file...");
      const r = await fetch("/api/extract", {
        method: "POST",
        body: formData, // no manual Content-Type header
      });
      if (!r.ok) {
        const t = await r.text();
        throw new Error(t);
      }
      const data = await r.json();

      const resumeEl = document.getElementById("resume");
      if (resumeEl) resumeEl.value = data.text || "";

      // Kick char-counter if present
      if (typeof updateCharCount === "function") {
        updateCharCount("resume", "resumeCount");
      }

      showMessage("success", "File text extracted and added to your resume.");
    } catch (err) {
      showMessage("error", friendlyError(err));
    } finally {
      // Restore button and allow re-selecting the same file
      uploadBtn.disabled = false;
      uploadBtn.innerHTML = originalHTML;
      resumeFileInput.value = "";
    }
  });
}

// ==============================
// Upload: JD → /api/extract
// (These elements are optional. If they don't exist in index.html yet,
// this block simply does nothing.)
// ==============================
const jdUploadBtn = document.getElementById("jdUploadBtn");
const jdFileInput = document.getElementById("jdFile");

if (jdUploadBtn && jdFileInput) {
  jdUploadBtn.addEventListener("click", () => jdFileInput.click());

  jdFileInput.addEventListener("change", async () => {
    const file = jdFileInput.files?.[0];
    if (!file) {
      showMessage("warn", "No file selected.");
      return;
    }
    const formData = new FormData();
    formData.append("file", file);

    try {
      showMessage("info", "Extracting text from JD file…");
      const r = await fetch("/api/extract", { method: "POST", body: formData });
      if (!r.ok) throw new Error(await r.text());
      const data = await r.json();

      const jdEl = document.getElementById("jobDesc") || document.getElementById("jd");
      if (jdEl) jdEl.value = data.text || "";
      showMessage("success", "Job description text extracted.");
    } catch (err) {
      showMessage("error", friendlyError(err));
    } finally {
      jdFileInput.value = "";
    }
  });
}

// ==============================
// Analyze Alignment → /api/analyze
// ==============================
const analyzeBtn = document.getElementById("analyzeBtn");
if (analyzeBtn) {
  const handler = withLoading(analyzeBtn, "Analyzing…", async () => {
    const resume = (document.getElementById("resume")?.value || "").trim();
    const jobDesc =
      (document.getElementById("jobDesc")?.value ||
        document.getElementById("jd")?.value ||
        "").trim();

    if (!resume || !jobDesc) {
      showMessage("warn", "Please paste both Resume and Job Description.");
      return;
    }

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

// ==============================
// Rewrite for Alignment → /api/rewrite
// (includes daily limit + optional controls from Lesson 7)
// ==============================
async function callRewriteAPI(resume, jd, options = {}) {
  const r = await fetch("/api/rewrite", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ resume, jd, ...options })
  });
  if (!r.ok) throw new Error(await r.text());
  const data = await r.json();
  return data.bullets || "";
}

const rewriteBtn = document.getElementById("rewriteBtn");

if (rewriteBtn) {
  const handler = withLoading(rewriteBtn, "Rewriting…", async () => {
    const resume = (document.getElementById("resume")?.value || "").trim();
    const jd =
      (document.getElementById("jd")?.value ||
       document.getElementById("jobDesc")?.value || "")
      .trim();

    if (!resume || !jd) {
      showMessage("warn", "Please paste both Resume and Job Description.");
      return;
    }

    // Optional: Lesson 7 controls (only if you have them in your HTML)
    const tone = (document.getElementById("tone")?.value || "Professional").toLowerCase();
    const seniority = (document.getElementById("seniority")?.value || "Mid").toLowerCase();
    const role = (document.getElementById("role")?.value || "Engineering").toLowerCase();

    // Optional: Lesson 8 daily limit (only if present in your code)
    if (typeof getRewritesUsed === "function" && typeof MAX_REWRITES_PER_DAY !== "undefined") {
      const used = getRewritesUsed();
      if (used >= MAX_REWRITES_PER_DAY) {
        showMessage("warn", "Daily limit reached. Please come back tomorrow or sign up to unlock more.");
        return;
      }
    }

    const bullets = await callRewriteAPI(resume, jd, { tone, seniority, role });
    const html = bullets
      .split("\n")
      .map(l => l.trim())
      .filter(Boolean)
      .map(l => l.replace(/^[-•*\d.)\s]+/, ""))
      .map(l => `<li>${l}</li>`)
      .join("");

    const summary = document.getElementById("summary");
    if (summary) summary.innerHTML = `<h3>AI Suggested Bullets</h3><ul>${html}</ul>`;

    if (typeof incrementRewrites === "function") incrementRewrites();
    if (typeof updateUsageCounter === "function") updateUsageCounter();

    showMessage("success", "AI rewrite complete.");
  });

  rewriteBtn.addEventListener("click", handler);
}

// ==============================
// Copy AI bullets to clipboard
// ==============================
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
      showMessage("success", "Copied AI bullets to clipboard.");
    } catch (err) {
     showMessage("error", friendlyError(err));
    }
  });
}

// ==============================
// Download DOCX via backend
// ==============================
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
      if (!r.ok) throw new Error(`DOCX export failed: ${await r.text()}`);

      const blob = await r.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = "ai_resume_bullets.docx";
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);

      showMessage("success", "Downloaded DOCX. Open it in Word/Pages.");
    } catch (e) {
      showMessage("error", friendlyError(err));
    }
  });

  downloadBtn.addEventListener("click", handler);
}

// ==============================
// Clear button
// ==============================
const clearBtn = document.getElementById("clearBtn");
if (clearBtn) {
  clearBtn.addEventListener("click", () => {
    const ids = ["resume", "jobDesc", "jd", "summary"];
    ids.forEach(id => {
      const el = document.getElementById(id);
      if (!el) return;
      if (el.tagName === "TEXTAREA" || el.tagName === "INPUT") {
        el.value = "";
      } else {
        el.innerHTML = "";
      }
    });
    showMessage("info", "Cleared inputs and results.");
  });
}