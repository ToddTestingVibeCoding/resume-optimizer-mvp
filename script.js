// ================================
// Resume Optimizer - script.js (Lesson 18 full)
// ================================

// ---------- Config ----------
const BASE_REWRITES_PER_DAY = 5;
const EMAIL_BONUS_REWRITES = 5;       // If user provides email, limit = 10/day
const AUTOSAVE_DEBOUNCE_MS = 400;

// ---- Draft + usage storage keys
const LS_KEYS = {
  resume: "ro.resume",
  jd: "ro.jd",
  savedAt: "ro.savedAt",
  email: "ro.email",
  rewritesDate: "ro.rewrites.date",
  rewritesCount: "ro.rewrites.count",
};

// ---------- Small utilities ----------
function debounce(fn, wait = 250) {
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
      originalHTML = btn.innerHTML;
      btn.disabled = true;
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
  const msg = (err?.message || err || "").toString();
  if (/rate limit/i.test(msg)) return "We’re getting a lot of traffic—please try again in a moment.";
  if (/invalid_api_key|api key/i.test(msg)) return "Server API key issue. Please try again later.";
  if (/network|failed to fetch/i.test(msg)) return "Network hiccup—check your connection and retry.";
  return msg;
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
  setTimeout(() => {
    if (div && div.parentNode) div.parentNode.removeChild(div);
  }, 5000);
}

// ---------- Tokenizing & keyword stats (for Analyze) ----------
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
    `Add a bullet using “${term}” in context (e.g., quantified impact or tool usage).`
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

// ---------- Usage limits (daily rewrites) + email gate ----------
function getDailyLimit() {
  const hasEmail = !!(localStorage.getItem(LS_KEYS.email) || "").trim();
  return BASE_REWRITES_PER_DAY + (hasEmail ? EMAIL_BONUS_REWRITES : 0);
}
function resetIfNewDay() {
  const today = new Date().toDateString();
  const storedDay = localStorage.getItem(LS_KEYS.rewritesDate);
  if (storedDay !== today) {
    localStorage.setItem(LS_KEYS.rewritesDate, today);
    localStorage.setItem(LS_KEYS.rewritesCount, "0");
  }
}
function getRewritesUsed() {
  resetIfNewDay();
  return parseInt(localStorage.getItem(LS_KEYS.rewritesCount) || "0", 10);
}
function incrementRewrites() {
  resetIfNewDay();
  const used = getRewritesUsed() + 1;
  localStorage.setItem(LS_KEYS.rewritesCount, String(used));
  updateUsageCounter();
}
function updateUsageCounter() {
  const el = document.getElementById("usageCounter");
  if (el) el.textContent = `${getRewritesUsed()} / ${getDailyLimit()} rewrites used today`;
}
function ensureEmailForBonus() {
  const hasEmail = !!(localStorage.getItem(LS_KEYS.email) || "").trim();
  if (hasEmail) return true;
  // simple prompt gate
  const email = window.prompt("You’ve hit the free daily limit. Enter your email to unlock more rewrites:");
  if (email && /\S+@\S+\.\S+/.test(email)) {
    localStorage.setItem(LS_KEYS.email, email.trim());
    showMessage("success", "Thanks! You now have extra daily rewrites.");
    updateUsageCounter();
    return true;
  }
  return false;
}

// ---------- Saved-status badges (top-level helpers) ----------
function setSavedStatus(which, whenISO) {
  const el = which === "resume" ? document.getElementById("resumeSaved")
                                : document.getElementById("jdSaved");
  if (!el) return;
  if (!whenISO) { el.textContent = "Not saved"; return; }
  const dt = new Date(whenISO);
  el.textContent = `Saved at ${dt.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })}`;
}
function refreshSavedStatusFromStorage() {
  const when = localStorage.getItem(LS_KEYS.savedAt);
  setSavedStatus("resume", when);
  setSavedStatus("jd", when);
}

// ---------- Draft save/load helpers ----------
function saveDraft() {
  const resumeEl = document.getElementById("resume");
  const jdEl = document.getElementById("jobDesc") || document.getElementById("jd");
  if (!resumeEl || !jdEl) return;

  localStorage.setItem(LS_KEYS.resume, resumeEl.value || "");
  localStorage.setItem(LS_KEYS.jd, jdEl.value || "");
  const when = new Date().toISOString();
  localStorage.setItem(LS_KEYS.savedAt, when);

  setSavedStatus("resume", when);
  setSavedStatus("jd", when);

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

  // Update counters if present
  const resumeCount = document.getElementById("resumeCount");
  const jobDescCount = document.getElementById("jobDescCount");
  if (resumeCount) updateCounterFrom(resumeEl, resumeCount);
  if (jobDescCount) updateCounterFrom(jdEl, jobDescCount);

  refreshSavedStatusFromStorage();
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

// ---------- Autosave wiring ----------
const debouncedSaveDraft = debounce(saveDraft, AUTOSAVE_DEBOUNCE_MS);
function wireAutosave() {
  const resumeEl = document.getElementById("resume");
  const jdEl = document.getElementById("jobDesc") || document.getElementById("jd");
  if (resumeEl) resumeEl.addEventListener("input", debouncedSaveDraft);
  if (jdEl) jdEl.addEventListener("input", debouncedSaveDraft);
}

// ---------- Upload Resume file → /api/extract ----------
(function wireUpload() {
  const uploadBtn = document.getElementById("uploadBtn");
  const resumeFileInput = document.getElementById("resumeFile");
  if (!uploadBtn || !resumeFileInput) return;

  uploadBtn.addEventListener("click", () => resumeFileInput.click());

  resumeFileInput.addEventListener("change", async () => {
    const file = resumeFileInput.files?.[0];
    if (!file) { showMessage("warn", "No file selected."); return; }

    const formData = new FormData();
    formData.append("file", file); // key must be "file"
    uploadBtn.disabled = true;
    const originalHTML = uploadBtn.innerHTML;
    uploadBtn.innerHTML = `<span class="spinner"></span>Extracting…`;

    try {
      const r = await fetch("/api/extract", { method: "POST", body: formData });
      if (!r.ok) throw new Error(await r.text());
      const data = await r.json();
      const resumeEl = document.getElementById("resume");
      if (resumeEl) resumeEl.value = data.text || "";
      // Save to draft immediately
      saveDraft();
      // Counters
      const resumeCount = document.getElementById("resumeCount");
      if (resumeCount && resumeEl) updateCounterFrom(resumeEl, resumeCount);
      showMessage("success", "File text extracted and added to your resume.");
    } catch (err) {
      showMessage("error", friendlyError(err));
    } finally {
      uploadBtn.disabled = false;
      uploadBtn.innerHTML = originalHTML;
      resumeFileInput.value = "";
    }
  });
})();

// ---------- Analyze Alignment (backend) ----------
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

    // Local quick stats (keep UI responsive) + call backend summarize
    const summaryEl = document.getElementById("summary");
    const topJdEl = document.getElementById("topJd");
    const missingEl = document.getElementById("missing");
    const suggestionsEl = document.getElementById("suggestions");

    const resumeCounts = keywordCounts(resume);
    const jdCounts = keywordCounts(jobDesc);
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
        </div>`;
    }
    renderList(topJdEl, jdTop, x => `${x.term} (${x.count})`);
    renderList(missingEl, miss, x => x.term);
    renderList(suggestionsEl, sugg);

    // Backend detailed analysis (optional enhancement)
    try {
      const r = await fetch("/api/analyze", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ resume, jobDesc })
      });
      if (!r.ok) return; // keep local results if server errs
      const data = await r.json();
      if (summaryEl && data.analysis) {
        summaryEl.innerHTML = `
          <div class="card">
            <h3>Alignment Analysis</h3>
            <p>${(data.analysis || "").replace(/\n/g, "<br>")}</p>
          </div>`;
      }
    } catch (err) {
      // silent—local stats already shown
    }
  });

  analyzeBtn.addEventListener("click", handler);
})();

// ---------- AI Rewrite (secure backend with limit + email gate) ----------
async function callRewriteAPI(resume, jd, opts) {
  const r = await fetch("/api/rewrite", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ resume, jd, ...opts })
  });
  if (!r.ok) {
    const t = await r.text();
    throw new Error(`Rewrite failed: ${t}`);
  }
  const data = await r.json();
  return data.bullets || "";
}

(function wireRewrite() {
  const rewriteBtn = document.getElementById("rewriteBtn");
  if (!rewriteBtn) return;

  const handler = withLoading(rewriteBtn, "Rewriting…", async () => {
    const resume = (document.getElementById("resume")?.value || "").trim();
    const jd = (document.getElementById("jobDesc")?.value || document.getElementById("jd")?.value || "").trim();
    const summary = document.getElementById("summary");

    if (!resume || !jd) {
      showMessage("warn", "Please paste both Resume and Job Description.");
      return;
    }

    // Check limit
    const used = getRewritesUsed();
    if (used >= getDailyLimit()) {
      // try email gate for bonus
      if (!ensureEmailForBonus()) return;
      if (getRewritesUsed() >= getDailyLimit()) {
        showMessage("warn", "Daily limit reached. Please come back tomorrow.");
        return;
      }
    }

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
        .map(l => l.replace(/^[-•*\d.)\s]+/, "")) // strip leading markers
        .map(l => `<li>${l}</li>`)
        .join("");

      if (summary) summary.innerHTML = `<div class="card"><h3>AI Suggested Bullets</h3><ul>${html}</ul></div>`;

      incrementRewrites();
      showMessage("success", `AI rewrite complete. (${getRewritesUsed()}/${getDailyLimit()} used today)`);
    } catch (e) {
      if (summary) summary.innerHTML = "";
      showMessage("error", friendlyError(e));
    }
  });

  rewriteBtn.addEventListener("click", handler);
})();

// ---------- Helpers to read current bullets from the UI ----------
function getCurrentBullets() {
  const summary = document.getElementById("summary");
  const lis = summary ? summary.querySelectorAll("li") : [];
  return Array.from(lis).map(li => li.textContent.trim()).filter(Boolean);
}

// ---------- Copy + Download bullets (DOCX via backend) ----------
(function wireCopyAndDocx() {
  // Copy
  const copyBtn = document.getElementById("copyBtn");
  if (copyBtn) {
    copyBtn.addEventListener("click", async () => {
      const bullets = getCurrentBullets();
      if (!bullets.length) { showMessage("warn", "No AI bullets to copy yet!"); return; }
      try {
        await navigator.clipboard.writeText(bullets.join("\n"));
        showMessage("success", "Copied AI bullets to your clipboard.");
      } catch (err) {
        showMessage("error", "Copy failed: " + (err?.message || err));
      }
    });
  }

  // Download DOCX of bullets
  const downloadBtn = document.getElementById("downloadBtn");
  if (downloadBtn) {
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
        a.href = url; a.download = "ai_resume_bullets.docx";
        document.body.appendChild(a); a.click(); document.body.removeChild(a);
        URL.revokeObjectURL(url);
        showMessage("success", "Downloaded DOCX. Open it in Word/Pages.");
      } catch (e) {
        showMessage("error", friendlyError(e));
      }
    });
    downloadBtn.addEventListener("click", handler);
  }
})();

// ---------- Draft Resume builder (beta) + download .txt ----------
function buildDraftResume(resume, jd, bullets) {
  const bulletLines = bullets.map(b => `• ${b}`).join("\n");
  return `# Tailored Resume Draft

## Profile
Brief professional summary aligned to the role.

## Key Achievements
${bulletLines}

## Experience
(Paste/adjust your experience here, weaving in the suggested bullets.)

## Skills
(Align with JD terminology here.)

## Education
(As applicable.)
`;
}

(function wireDraftResume() {
  const buildDraftBtn = document.getElementById("buildDraftBtn");
  const downloadDraftBtn = document.getElementById("downloadDraftBtn");

  if (buildDraftBtn) {
    buildDraftBtn.addEventListener("click", () => {
      const resume = (document.getElementById("resume")?.value || "").trim();
      const jd = (document.getElementById("jobDesc")?.value || document.getElementById("jd")?.value || "").trim();
      const bullets = getCurrentBullets();
      if (!bullets.length) { showMessage("warn", "No AI bullets found. Click “Rewrite for Alignment (AI)” first."); return; }

      const draft = buildDraftResume(resume, jd, bullets);
      const draftEl = document.getElementById("draftResume");
      if (draftEl) {
        draftEl.value = draft;
        showMessage("success", "Draft built from your AI bullets. Edit freely before downloading.");
      }
    });
  }

  if (downloadDraftBtn) {
    downloadDraftBtn.addEventListener("click", async () => {
      const draftEl = document.getElementById("draftResume");
      const text = (draftEl?.value || "").trim();
      if (!text) { showMessage("warn", "No draft content to download yet. Click “Build Draft from Bullets” first."); return; }

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
        a.href = url; a.download = "Tailored_Resume_Draft.txt";
        document.body.appendChild(a); a.click(); document.body.removeChild(a);
        URL.revokeObjectURL(url);
        showMessage("success", "Draft downloaded as .txt");
      } catch (err) {
        showMessage("error", friendlyError(err));
      }
    });
  }
})();

// ---------- Clear (resets fields only; separate from Clear Draft button) ----------
(function wireClear() {
  const clearBtn = document.getElementById("clearBtn");
  if (!clearBtn) return;

  clearBtn.addEventListener("click", () => {
    const ids = ["resume", "jobDesc", "jd", "summary", "draftResume", "topJd", "missing", "suggestions"];
    for (const id of ids) {
      const el = document.getElementById(id);
      if (!el) continue;
      if (el.tagName === "TEXTAREA" || el.tagName === "INPUT") el.value = "";
      else el.innerHTML = "";
    }
    // Reset counters
    const resumeCount = document.getElementById("resumeCount");
    const jobDescCount = document.getElementById("jobDescCount");
    if (resumeCount) resumeCount.textContent = "0 characters";
    if (jobDescCount) jobDescCount.textContent = "0 characters";
    showMessage("info", "Cleared. Paste your fresh text to continue.");
  });
})();

// ---------- Draft save/load buttons (optional UI) ----------
(() => {
  const saveBtn = document.getElementById("saveBtn");
  if (saveBtn) saveBtn.addEventListener("click", () => { saveDraft(); });

  const loadBtn = document.getElementById("loadBtn");
  if (loadBtn) loadBtn.addEventListener("click", () => { loadDraft(); });

  const clearDraftBtn = document.getElementById("clearDraftBtn");
  if (clearDraftBtn) clearDraftBtn.addEventListener("click", () => {
    clearDraft();
    setSavedStatus("resume", null);
    setSavedStatus("jd", null);
    showMessage("success", "Draft cleared.");
  });
})();

// ---------- On load: counters, autosave, usage, saved badges, (optional) autoshow-restore ----------
document.addEventListener("DOMContentLoaded", () => {
  wireCounters();
  wireAutosave();
  updateUsageCounter();
  refreshSavedStatusFromStorage();

  // Optional: politely offer restoring last draft if fields are empty but we have a saved draft
  const resumeEl = document.getElementById("resume");
  const jdEl = document.getElementById("jobDesc") || document.getElementById("jd");
  const hasSaved = (localStorage.getItem(LS_KEYS.resume) || localStorage.getItem(LS_KEYS.jd) || "").length > 0;
  const bothEmpty = (!resumeEl?.value && !jdEl?.value);

  if (hasSaved && bothEmpty) {
    const ok = confirm("Load your last saved draft?");
    if (ok) loadDraft();
  }
});