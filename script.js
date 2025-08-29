// ==========================================
// Resume Optimizer — script.js (Lesson 1–17)
// Solid build: autosave + results + limits
// ==========================================

// ---------- Config ----------
const BASE_REWRITES_PER_DAY = 5;
const EMAIL_BONUS_REWRITES = 5; // becomes 10/day after email
const AUTOSAVE_DEBOUNCE_MS = 500;

// ---------- LocalStorage keys ----------
const LS_KEYS = {
  resume: "ro.resume",
  jd: "ro.jd",
  savedAt: "ro.savedAt",
  usageDate: "ro.usage.date",
  rewritesUsed: "ro.usage.used",
  hasEmail: "ro.hasEmail"
};

// ---------- Small utilities ----------
function debounce(fn, wait = 300) {
  let t;
  return (...args) => {
    clearTimeout(t);
    t = setTimeout(() => fn(...args), wait);
  };
}

function friendlyError(err) {
  const msg = err?.message || String(err || "");
  if (/rate limit/i.test(msg)) return "We’re hitting provider limits. Please retry shortly.";
  if (/invalid_api_key/i.test(msg)) return "Server is missing its API key. (Owner: add OPENAI_API_KEY to Vercel).";
  if (/unsupported file/i.test(msg)) return "That file type isn’t supported. Try .docx, .pdf, or .txt.";
  if (/no file/i.test(msg)) return "No file was uploaded. Choose a .docx, .pdf, or .txt and try again.";
  return msg.replace(/^Error:\s*/i, "");
}

// ---------- Messaging UI ----------
function showMessage(type, text) {
  // types: info | success | warn | error
  let box = document.getElementById("messages");
  if (!box) box = document.querySelector("main.container") || document.body;

  const div = document.createElement("div");
  div.className = `alert ${type}`;
  div.textContent = text;
  box.prepend(div);
  setTimeout(() => div.remove(), 5500);
}

function spinnerHTML(text = "Working…") {
  return `<span class="spinner" aria-hidden="true"></span>${text}`;
}

// ---------- Character counters ----------
function updateCounterFrom(el, counterEl) {
  if (!el || !counterEl) return;
  counterEl.textContent = `${(el.value || "").length} characters`;
}
function wireCounters() {
  const resumeEl = document.getElementById("resume");
  const jobDescEl = document.getElementById("jobDesc") || document.getElementById("jd");
  const resumeCount = document.getElementById("resumeCount") || document.getElementById("resumeCounter");
  const jobDescCount = document.getElementById("jobDescCount") || document.getElementById("jdCounter");

  if (resumeEl && resumeCount) {
    updateCounterFrom(resumeEl, resumeCount);
    resumeEl.addEventListener("input", () => updateCounterFrom(resumeEl, resumeCount));
  }
  if (jobDescEl && jobDescCount) {
    updateCounterFrom(jobDescEl, jobDescCount);
    jobDescEl.addEventListener("input", () => updateCounterFrom(jobDescEl, jobDescCount));
  }
}

// ---------- Tokenizing / keyword stats (client analysis) ----------
const STOPWORDS = new Set([
  "the","and","or","to","a","of","in","for","on","with","is","are","as","at","by",
  "an","be","this","that","from","it","you","your","we","our","their","they","will",
  "can","ability","responsible","responsibilities","experience","years"
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
    .sort((a, b) => b[1] - a[1])
    .slice(0, limit)
    .map(([term, count]) => ({ term, count }));
}

function missingTerms(jdTop, resumeCounts) {
  const missing = [];
  for (const { term, count } of jdTop) {
    if (!resumeCounts.has(term)) missing.push({ term, jdCount: count });
  }
  return missing;
}

function roughSuggestions(missing) {
  return missing.slice(0, 10).map(({ term }) =>
    `Add a bullet using “${term}” in context (impact, numbers, specific tools).`
  );
}

function renderList(el, items, formatter = (x) => x) {
  if (!el) return;
  el.innerHTML = "";
  for (const item of items) {
    const li = document.createElement("li");
    li.textContent = formatter(item);
    el.appendChild(li);
  }
}

// ---------- Usage limits + email gate ----------
function getTodayKey() {
  const d = new Date();
  return `${d.getUTCFullYear()}-${d.getUTCMonth() + 1}-${d.getUTCDate()}`;
}
function getDailyAllowance() {
  const hasEmail = localStorage.getItem(LS_KEYS.hasEmail) === "true";
  return BASE_REWRITES_PER_DAY + (hasEmail ? EMAIL_BONUS_REWRITES : 0);
}
function getRewritesUsed() {
  const today = getTodayKey();
  const storedDate = localStorage.getItem(LS_KEYS.usageDate);
  if (storedDate !== today) {
    localStorage.setItem(LS_KEYS.usageDate, today);
    localStorage.setItem(LS_KEYS.rewritesUsed, "0");
    return 0;
  }
  return parseInt(localStorage.getItem(LS_KEYS.rewritesUsed) || "0", 10);
}
function incrementRewrites() {
  const used = getRewritesUsed() + 1;
  localStorage.setItem(LS_KEYS.rewritesUsed, String(used));
  updateUsageCounter();
  return used;
}
function updateUsageCounter() {
  const el = document.getElementById("usageCounter");
  if (el) el.textContent = `${getRewritesUsed()} / ${getDailyAllowance()} rewrites used today`;
}
async function emailGate() {
  if (localStorage.getItem(LS_KEYS.hasEmail) === "true") return true;
  const email = window.prompt("You're at the daily limit. Enter your email to unlock 5 more today:");
  if (!email || !/@/.test(email)) return false;
  try {
    await fetch("/api/subscribe-email", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email })
    });
  } catch { /* non-blocking */ }
  localStorage.setItem(LS_KEYS.hasEmail, "true");
  updateUsageCounter();
  showMessage("success", "Thanks! You’ve unlocked 5 more rewrites today.");
  return true;
}

// ---------- Autosave (resume & jobDesc) ----------
function saveDraft() {
  const resumeEl = document.getElementById("resume");
  const jdEl = document.getElementById("jobDesc") || document.getElementById("jd");
  if (!resumeEl || !jdEl) return;

  localStorage.setItem(LS_KEYS.resume, resumeEl.value || "");
  localStorage.setItem(LS_KEYS.jd, jdEl.value || "");
  localStorage.setItem(LS_KEYS.savedAt, new Date().toISOString());
}

const debouncedSaveDraft = debounce(saveDraft, AUTOSAVE_DEBOUNCE_MS);

function wireAutosave() {
  const resumeEl = document.getElementById("resume");
  const jdEl = document.getElementById("jobDesc") || document.getElementById("jd");
  if (resumeEl) resumeEl.addEventListener("input", debouncedSaveDraft);
  if (jdEl) jdEl.addEventListener("input", debouncedSaveDraft);
  // backup save on navigation
  window.addEventListener("beforeunload", () => {
    try { saveDraft(); } catch {}
  });
}

function loadDraft() {
  const resumeEl = document.getElementById("resume");
  const jdEl = document.getElementById("jobDesc") || document.getElementById("jd");
  if (!resumeEl || !jdEl) return;

  const resume = localStorage.getItem(LS_KEYS.resume) || "";
  const jd = localStorage.getItem(LS_KEYS.jd) || "";
  resumeEl.value = resume;
  jdEl.value = jd;

  // update counters if present
  const resumeCount = document.getElementById("resumeCount") || document.getElementById("resumeCounter");
  const jobDescCount = document.getElementById("jobDescCount") || document.getElementById("jdCounter");
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

// ---------- Draft save/load buttons (optional) ----------
(() => {
  const saveBtn = document.getElementById("saveBtn");
  if (saveBtn) saveBtn.addEventListener("click", () => {
    saveDraft();
    showMessage("success", "Draft saved.");
  });

  const loadBtn = document.getElementById("loadBtn");
  if (loadBtn) loadBtn.addEventListener("click", () => {
    loadDraft();
  });

  const clearDraftBtn = document.getElementById("clearDraftBtn");
  if (clearDraftBtn) clearDraftBtn.addEventListener("click", () => {
    clearDraft();
    showMessage("success", "Draft cleared.");
  });
})();

function insertDraftBanner() {
  const host = document.getElementById("messages") || document.querySelector("main.container") || document.body;
  const banner = document.createElement("div");
  banner.className = "alert info";
  banner.id = "draftBanner";
  banner.style.display = "none";
  banner.innerHTML = `
    <strong>Found a saved draft.</strong>
    <button id="loadDraftBtn" class="chip-btn" type="button" style="margin-left:8px;">Load</button>
    <button id="dismissDraftBtn" class="chip-btn ghost" type="button" style="margin-left:6px;">Dismiss</button>
  `;
  host.prepend(banner);
  return banner;
}

function loadDraftOnInit() {
  const hasAny =
    (localStorage.getItem(LS_KEYS.resume) || "") ||
    (localStorage.getItem(LS_KEYS.jd) || "");
  const banner = insertDraftBanner();
  if (!hasAny || !banner) return;

  banner.style.display = "block";
  const loadBtn = document.getElementById("loadDraftBtn");
  const dismissBtn = document.getElementById("dismissDraftBtn");

  if (loadBtn) {
    loadBtn.addEventListener("click", () => {
      loadDraft();
      banner.remove();
    });
  }
  if (dismissBtn) {
    dismissBtn.addEventListener("click", () => {
      banner.remove();
    });
  }
}

// ---------- Loading helper for buttons ----------
function withLoading(btn, labelWhileLoading, fn) {
  return async function (...args) {
    let original;
    if (btn) {
      btn.disabled = true;
      original = btn.innerHTML;
      btn.innerHTML = spinnerHTML(labelWhileLoading);
    }
    try {
      return await fn(...args);
    } finally {
      if (btn) {
        btn.disabled = false;
        btn.innerHTML = original;
      }
    }
  };
}

// ---------- Analyze Alignment (client-side) ----------
(function wireAnalyze() {
  const analyzeBtn = document.getElementById("analyzeBtn");
  if (!analyzeBtn) return;

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

    // client-only analysis
    const resumeCounts = keywordCounts(resume);
    const jdCounts = keywordCounts(jobDesc);
    const jdTop = topTerms(jdCounts, 20);
    const miss = missingTerms(jdTop, resumeCounts);
    const sugg = roughSuggestions(miss);

    const summaryEl = document.getElementById("summary");
    const topJdEl = document.getElementById("topJd");
    const missingEl = document.getElementById("missing");
    const suggestionsEl = document.getElementById("suggestions");

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
})();

// ---------- AI Rewrite (backend) ----------
async function callRewriteAPI(resume, jobDesc, opts) {
  const r = await fetch("/api/rewrite", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ resume, jd: jobDesc, ...opts })
  });
  if (!r.ok) throw new Error(await r.text());
  const data = await r.json();
  return data.bullets || "";
}

(function wireRewrite() {
  const rewriteBtn = document.getElementById("rewriteBtn");
  if (!rewriteBtn) return;

  const handler = withLoading(rewriteBtn, "Rewriting…", async () => {
    const resume = (document.getElementById("resume")?.value || "").trim();
    const jobDesc =
      (document.getElementById("jobDesc")?.value ||
        document.getElementById("jd")?.value ||
        "").trim();
    const summary = document.getElementById("summary");

    if (!resume || !jobDesc) {
      showMessage("warn", "Please paste both Resume and Job Description.");
      return;
    }

    // enforce daily limit
    const used = getRewritesUsed();
    const max = getDailyAllowance();
    if (used >= max) {
      const ok = await emailGate();
      if (!ok) return;
    }

    const tone = (document.getElementById("tone")?.value || "Professional").toLowerCase();
    const seniority = (document.getElementById("seniority")?.value || "Mid").toLowerCase();
    const role = (document.getElementById("role")?.value || "General").toLowerCase();

    if (summary) summary.innerHTML = spinnerHTML("Rewriting with AI…");

    try {
      const bullets = await callRewriteAPI(resume, jobDesc, { tone, seniority, role });
      const html = bullets
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
          </div>`;
      }
      incrementRewrites();
      showMessage("success", `AI rewrite complete. (${getRewritesUsed()}/${getDailyAllowance()} used today)`);
    } catch (err) {
      if (summary) summary.innerHTML = "";
      showMessage("error", friendlyError(err));
    }
  });

  rewriteBtn.addEventListener("click", handler);
  updateUsageCounter();
})();

// ---------- Copy / Download (bullets) ----------
function getCurrentBullets() {
  const summary = document.getElementById("summary");
  const lis = summary ? summary.querySelectorAll("li") : [];
  return Array.from(lis).map(li => li.textContent.trim()).filter(Boolean);
}

(function wireCopyDownload() {
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
        a.remove();
        URL.revokeObjectURL(url);
        showMessage("success", "Downloaded DOCX. Open it in Word/Pages.");
      } catch (err) {
        showMessage("error", friendlyError(err));
      }
    });
    downloadBtn.addEventListener("click", handler);
  }
})();

// ---------- Upload → /api/extract ----------
(function wireUpload() {
  const uploadBtn = document.getElementById("uploadBtn");
  const resumeFileInput = document.getElementById("resumeFile");
  if (!uploadBtn || !resumeFileInput) return;

  uploadBtn.addEventListener("click", () => resumeFileInput.click());

  resumeFileInput.addEventListener("change", async () => {
    const file = resumeFileInput.files?.[0];
    if (!file) {
      showMessage("warn", "No file selected.");
      return;
    }
    const formData = new FormData();
    formData.append("file", file); // IMPORTANT: key must be "file"

    const originalHTML = uploadBtn.innerHTML;
    uploadBtn.disabled = true;
    uploadBtn.innerHTML = spinnerHTML("Extracting…");
    try {
      const r = await fetch("/api/extract", { method: "POST", body: formData });
      if (!r.ok) throw new Error(await r.text());
      const data = await r.json();
      const resumeEl = document.getElementById("resume");
      if (resumeEl) resumeEl.value = data.text || "";
      saveDraft(); // persist
      showMessage("success", "File text extracted and added to your resume.");
      // update counter if present
      const resumeCount = document.getElementById("resumeCount") || document.getElementById("resumeCounter");
      if (resumeEl && resumeCount) updateCounterFrom(resumeEl, resumeCount);
    } catch (err) {
      showMessage("error", friendlyError(err));
    } finally {
      uploadBtn.disabled = false;
      uploadBtn.innerHTML = originalHTML;
      resumeFileInput.value = "";
    }
  });
})();

// ---------- Clear ----------
(function wireClear() {
  const clearBtn = document.getElementById("clearBtn");
  if (!clearBtn) return;

  clearBtn.addEventListener("click", () => {
    const ids = ["resume", "jobDesc", "jd", "summary", "topJd", "missing", "suggestions", "draftResume"];
    ids.forEach(id => {
      const el = document.getElementById(id);
      if (!el) return;
      if (el.tagName === "TEXTAREA" || el.tagName === "INPUT") el.value = "";
      else el.innerHTML = "";
    });
    clearDraft();
    const resumeCount = document.getElementById("resumeCount") || document.getElementById("resumeCounter");
    const jobDescCount = document.getElementById("jobDescCount") || document.getElementById("jdCounter");
    if (resumeCount) resumeCount.textContent = "0 characters";
    if (jobDescCount) jobDescCount.textContent = "0 characters";
    showMessage("info", "Cleared. Paste your fresh text to continue.");
  });
})();

// ---------- Build Draft Resume (client) ----------
function buildDraftResume(resume, jd, bullets) {
  const header = `Draft Resume (Tailored)\n\n`;
  const intro = `Summary:\nTailored resume aligned to the provided job description.\n\n`;
  const bulletsText = bullets.map(b => `• ${b}`).join("\n");
  return `${header}${intro}${bulletsText}\n`;
}

(function wireDraft() {
  const buildDraftBtn = document.getElementById("buildDraftBtn");
  const downloadDraftBtn = document.getElementById("downloadDraftBtn");
  if (buildDraftBtn) {
    buildDraftBtn.addEventListener("click", () => {
      const resumeEl = document.getElementById("resume");
      const jdEl = document.getElementById("jobDesc") || document.getElementById("jd");
      const draftEl = document.getElementById("draftResume");

      const resume = (resumeEl?.value || "").trim();
      const jd = (jdEl?.value || "").trim();
      const bullets = getCurrentBullets();

      if (!bullets.length) {
        showMessage("warn", "No AI bullets found. Click “Rewrite for Alignment (AI)” first.");
        return;
      }
      const draft = buildDraftResume(resume, jd, bullets);
      if (draftEl) {
        draftEl.value = draft;
        showMessage("success", "Draft built from your AI bullets. Edit freely before downloading.");
      }
    });
  }

  if (downloadDraftBtn) {
    const handler = withLoading(downloadDraftBtn, "Preparing…", async () => {
      const draftEl = document.getElementById("draftResume");
      const text = (draftEl?.value || "").trim();
      if (!text) {
        showMessage("warn", "No draft content to download yet. Click “Build Draft from Bullets” first.");
        return;
      }
      try {
        const r = await fetch("/api/download-text", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ title: "Tailored_Resume_Draft", text })
        });
        if (!r.ok) throw new Error(await r.text());
        const blob = await r.blob();
        const url = URL.createObjectURL(blob);
        const a = document.createElement("a");
        a.href = url;
        a.download = "tailored_resume_draft.txt";
        document.body.appendChild(a);
        a.click();
        a.remove();
        URL.revokeObjectURL(url);
        showMessage("success", "Draft downloaded as .txt");
      } catch (err) {
        showMessage("error", friendlyError(err));
      }
    });
    downloadDraftBtn.addEventListener("click", handler);
  }
})();

// ---------- Init (run after DOM is ready) ----------
document.addEventListener("DOMContentLoaded", () => {
  try { wireCounters(); } catch {}
  try { wireAutosave(); } catch {}
  try { loadDraftOnInit(); } catch {}
  try { updateUsageCounter(); } catch {}
});