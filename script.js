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

// ---------- Loading helper ----------
function withLoading(btn, labelWhileLoading, fn) {
  return async function (...args) {
    let original;
    if (btn) {
      btn.disabled = true;
      original = btn.textContent;
      btn.textContent = labelWhileLoading;
    }
    try {
      return await fn(...args);
    } finally {
      if (btn) {
        btn.disabled = false;
        btn.textContent = original;
      }
    }
  };
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
const uploadBtn = document.getElementById("uploadBtn");
const resumeFileInput = document.getElementById("resumeFile");

if (uploadBtn && resumeFileInput) {
  uploadBtn.addEventListener("click", () => resumeFileInput.click());

  resumeFileInput.addEventListener("change", async () => {
    const file = resumeFileInput.files?.[0];
    if (!file) {
      showMessage("warn", "No file selected.");
      return;
    }
    const formData = new FormData();
    formData.append("file", file);

    try {
      showMessage("info", "Extracting text from resume file…");
      const r = await fetch("/api/extract", { method: "POST", body: formData });
      if (!r.ok) throw new Error(await r.text());
      const data = await r.json();

      const resumeEl = document.getElementById("resume");
      if (resumeEl) resumeEl.value = data.text || "";
      showMessage("success", "Resume text extracted.");
    } catch (err) {
      showMessage("error", "Upload failed: " + (err?.message || err));
    } finally {
      resumeFileInput.value = ""; // allow same-file reselect
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
      showMessage("error", "Upload failed: " + (err?.message || err));
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
      showMessage("error", "Analysis failed: " + (err?.message || err));
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
      (document.getElementById("jobDesc")?.value ||
        document.getElementById("jd")?.value ||
        "").trim();

    if (!resume || !jd) {
      showMessage("warn", "Please paste both Resume and Job Description first.");
      return;
    }

    // daily limit
    const used = getRewritesUsed();
    if (used >= MAX_REWRITES_PER_DAY) {
      showMessage(
        "warn",
        "Daily limit reached. Please come back tomorrow or sign up to unlock more."
      );
      return;
    }

    // Optional controls from Lesson 7 (safe defaults if not present)
    const tone = (document.getElementById("tone")?.value || "Professional").toLowerCase();
    const seniority = (document.getElementById("seniority")?.value || "Mid").toLowerCase();
    const role = (document.getElementById("role")?.value || "General").toLowerCase();

    const summary = document.getElementById("summary");
    if (summary) summary.innerHTML = `<div class="card">${spinnerHTML("Rewriting with AI…")}</div>`;

    try {
      const bulletsText = await callRewriteAPI(resume, jd, { tone, seniority, role });

      const html = bulletsText
        .split("\n")
        .map(l => l.trim())
        .filter(Boolean)
        .map(l => l.replace(/^[-•*\d.)\s]+/, "")) // strip any leading markers
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
      updateUsageCounter();
      showMessage(
        "success",
        `AI rewrite complete. (${getRewritesUsed()}/${MAX_REWRITES_PER_DAY} used today)`
      );
    } catch (e) {
      if (summary) summary.innerHTML = "";
      showMessage("error", `Rewrite failed: ${e.message}`);
    }
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
      showMessage("error", "Copy failed: " + err.message);
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
      showMessage("error", e.message);
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