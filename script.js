// ================================
// Resume Optimizer - script.js (Prod)
// Lessons 1–17 consolidated
// ================================

// ---------- Config ----------
const BASE_REWRITES_PER_DAY = 5;
const EMAIL_BONUS_REWRITES = 5;  // +5 once email collected (total 10)
const AUTOSAVE_DEBOUNCE_MS = 400;

const USAGE_KEYS = {
  date: "ro.usage.date",
  count: "ro.usage.count",
  email: "ro.hasEmail"
};

// ---- Draft storage keys ----
const LS_KEYS = {
  resume: "ro.resume",
  jd: "ro.jd",
  savedAt: "ro.savedAt"
};

// ---------- Small utilities ----------
function debounce(fn, wait = 250) {
  let t;
  return (...args) => {
    clearTimeout(t);
    t = setTimeout(() => fn(...args), wait);
  };
}

function todayStr() {
  const d = new Date();
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

function friendlyError(err) {
  try {
    if (typeof err === "string") return err;
    const m = err?.message || "";
    if (/rate limit/i.test(m)) return "Rate limit hit. Try again in ~30 seconds.";
    if (/invalid_api_key/i.test(m)) return "Server API key issue. Please check Vercel env.";
    if (/network|fetch|failed to fetch/i.test(m)) return "Network error. Check your connection and try again.";
    return m || "Something went wrong. Please try again.";
  } catch {
    return "Something went wrong. Please try again.";
  }
}

// ---------- Messaging UI ----------
function clearMessages() {
  const box = document.getElementById("messages");
  if (box) box.innerHTML = "";
}

function showMessage(type, text) {
  // types: info | success | warn | error
  let box = document.getElementById("messages");
  if (!box) box = document.getElementById("summary"); // fallback
  if (!box) return;
  const div = document.createElement("div");
  div.className = `alert ${type}`;
  div.textContent = text;
  box.prepend(div);
  setTimeout(() => div.remove(), 5000);
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

// ---------- Local term analysis helpers ----------
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
    if (!resumeCounts.has(term)) {
      missing.push({ term, jdCount: count });
    }
  }
  return missing;
}

function roughSuggestions(missing) {
  return missing.slice(0, 10).map(({ term }) =>
    `Add a bullet using “${term}” in context (quantified result, tool/framework, team scope).`
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

// ---------- Usage tracking (per-day) + email gate ----------
function getMaxRewrites() {
  return hasEmail() ? BASE_REWRITES_PER_DAY + EMAIL_BONUS_REWRITES : BASE_REWRITES_PER_DAY;
}

function hasEmail() {
  return localStorage.getItem(USAGE_KEYS.email) === "true";
}

function markEmailProvided() {
  localStorage.setItem(USAGE_KEYS.email, "true");
}

function ensureUsageDay() {
  const today = todayStr();
  const last = localStorage.getItem(USAGE_KEYS.date);
  if (last !== today) {
    localStorage.setItem(USAGE_KEYS.date, today);
    localStorage.setItem(USAGE_KEYS.count, "0");
  }
}

function getRewritesUsed() {
  ensureUsageDay();
  return parseInt(localStorage.getItem(USAGE_KEYS.count) || "0", 10);
}

function incrementRewrites() {
  ensureUsageDay();
  const used = getRewritesUsed() + 1;
  localStorage.setItem(USAGE_KEYS.count, String(used));
}

function updateUsageCounter() {
  const el = document.getElementById("usageCounter");
  if (!el) return;
  el.textContent = `${getRewritesUsed()} / ${getMaxRewrites()} rewrites used today`;
}

async function maybeCollectEmail() {
  if (hasEmail()) return true;
  const email = prompt(
    "You’ve hit today’s free limit (5). Enter your email to unlock 5 more rewrites (total 10/day):"
  );
  if (!email) return false;
  const ok = /\S+@\S+\.\S+/.test(email);
  if (!ok) {
    showMessage("warn", "That email doesn’t look valid. You can try again on the next attempt.");
    return false;
  }
  // (Optional) POST to /api/subscribe here
  markEmailProvided();
  updateUsageCounter();
  showMessage("success", "Thanks! You’ve unlocked 5 more rewrites for today.");
  return true;
}

// ---------- Draft save/load/clear + autosave ----------
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

  // Update counters
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

function maybeOfferDraftOnLoad() {
  const resumeEl = document.getElementById("resume");
  const jdEl = document.getElementById("jobDesc") || document.getElementById("jd");
  if (!resumeEl || !jdEl) return;
  const hasStored = (localStorage.getItem(LS_KEYS.resume) || localStorage.getItem(LS_KEYS.jd) || "").length > 0;
  const currentEmpty = !(resumeEl.value || "").trim() && !(jdEl.value || "").trim();
  if (hasStored && currentEmpty) {
    const ok = confirm("We found a saved draft. Load it now?");
    if (ok) loadDraft();
  }
}

// ---------- Analyze (local panels + backend text) ----------
async function runLocalPanels(resume, jd) {
  const summaryEl = document.getElementById("summary");
  const topJdEl = document.getElementById("topJd");
  const missingEl = document.getElementById("missing");
  const suggestionsEl = document.getElementById("suggestions");

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
      </div>
    `;
  }
  renderList(topJdEl, jdTop, x => `${x.term} (${x.count})`);
  renderList(missingEl, miss, x => x.term);
  renderList(suggestionsEl, sugg);
}

async function callAnalyzeAPI(resume, jobDesc) {
  const r = await fetch("/api/analyze", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ resume, jobDesc })
  });
  if (!r.ok) throw new Error(await r.text());
  return r.json();
}

// ---------- Rewrite (secure backend) ----------
async function callRewriteAPI(resume, jd, opts = {}) {
  const r = await fetch("/api/rewrite", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ resume, jd, ...opts })
  });
  if (!r.ok) throw new Error(await r.text());
  return r.json(); // { bullets: "..." }
}

function getCurrentBullets() {
  const summary = document.getElementById("summary");
  const lis = summary ? summary.querySelectorAll("li") : [];
  return Array.from(lis).map(li => li.textContent.trim()).filter(Boolean);
}

// ---------- Build Draft Resume (beta) ----------
function buildDraftResume(resume, jd, bullets) {
  // Simple, structured text draft – safe for .txt download
  const header = "Draft Resume (Tailored)\n=========================\n";
  const objective = jd ? "Objective: Align experience with role requirements.\n" : "";
  const bulletsText = bullets.map(b => `• ${b}`).join("\n");
  const base = [
    header,
    objective,
    "\nCore Contributions:\n",
    bulletsText || "• (Add AI bullets here…)",
    "\n\nExperience Summary:\n",
    (resume && resume.slice(0, 1200)) || "(Paste past roles & details here)"
  ].join("");
  return base.trim() + "\n";
}

// ---------- Wire DOM once loaded ----------
document.addEventListener("DOMContentLoaded", () => {
  // Initial usage counter
  ensureUsageDay();
  updateUsageCounter();

  // Counters & autosave
  wireCounters();
  const resumeEl = document.getElementById("resume");
  const jdEl = document.getElementById("jobDesc") || document.getElementById("jd");
  const debouncedSave = debounce(saveDraft, AUTOSAVE_DEBOUNCE_MS);
  if (resumeEl) resumeEl.addEventListener("input", debouncedSave);
  if (jdEl) jdEl.addEventListener("input", debouncedSave);

  // Offer loading prior draft
  maybeOfferDraftOnLoad();

  // ----- Buttons -----
  // Analyze
  const analyzeBtn = document.getElementById("analyzeBtn");
  if (analyzeBtn) {
    const handler = withLoading(analyzeBtn, "Analyzing…", async () => {
      clearMessages();
      const resume = (resumeEl?.value || "").trim();
      const jd = (jdEl?.value || "").trim();
      if (!resume || !jd) {
        showMessage("warn", "Please paste both Resume and Job Description.");
        return;
      }

      // 1) Local panels (top terms / missing / suggestions + coverage)
      await runLocalPanels(resume, jd);

      // 2) Backend narrative analysis
      try {
        const data = await callAnalyzeAPI(resume, jd);
        const summary = document.getElementById("summary");
        if (summary) {
          const card = document.createElement("div");
          card.className = "card";
          card.innerHTML = `
            <h3>Deeper Alignment Notes</h3>
            <p>${String(data.analysis || "")
              .replace(/</g, "&lt;")
              .replace(/\n/g, "<br>")}</p>
          `;
          summary.appendChild(card);
        }
        showMessage("success", "Alignment analysis complete.");
      } catch (err) {
        showMessage("error", "Analysis failed: " + friendlyError(err));
      }
    });
    analyzeBtn.addEventListener("click", handler);
  }

  // Rewrite
  const rewriteBtn = document.getElementById("rewriteBtn");
  if (rewriteBtn) {
    const handler = withLoading(rewriteBtn, "Rewriting…", async () => {
      clearMessages();
      const resume = (resumeEl?.value || "").trim();
      const jd = (jdEl?.value || "").trim();
      if (!resume || !jd) {
        showMessage("warn", "Please paste both Resume and Job Description.");
        return;
      }

      // Usage gate
      const used = getRewritesUsed();
      const max = getMaxRewrites();
      if (used >= max) {
        const ok = await maybeCollectEmail();
        if (!ok) {
          showMessage("warn", "Daily limit reached. Come back tomorrow or unlock more with email.");
          return;
        }
      }

      // Lesson 7 controls
      const tone = (document.getElementById("tone")?.value || "Professional").toLowerCase();
      const seniority = (document.getElementById("seniority")?.value || "Mid").toLowerCase();
      const role = (document.getElementById("role")?.value || "General").toLowerCase();

      const summary = document.getElementById("summary");
      if (summary) summary.innerHTML = spinnerHTML("Rewriting with AI…");

      try {
        const data = await callRewriteAPI(resume, jd, { tone, seniority, role });
        const bulletsStr = data.bullets || "";
        const html = bulletsStr
          .split("\n")
          .map(l => l.trim())
          .filter(Boolean)
          .map(l => l.replace(/^[-•*\d.)\s]+/, "")) // strip markers
          .map(l => `<li>${l}</li>`)
          .join("");
        if (summary) summary.innerHTML = `<h3>AI Suggested Bullets</h3><ul>${html}</ul>`;

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

  // Clear everything (text areas + panels + counts)
  const clearBtn = document.getElementById("clearBtn");
  if (clearBtn) {
    clearBtn.addEventListener("click", () => {
      const ids = ["resume", "jobDesc", "jd", "summary", "topJd", "missing", "suggestions", "draftResume"];
      for (const id of ids) {
        const el = document.getElementById(id);
        if (!el) continue;
        if (el.tagName === "TEXTAREA" || el.tagName === "INPUT") el.value = "";
        else el.innerHTML = "";
      }
      clearDraft();
      const rc = document.getElementById("resumeCount");
      const jc = document.getElementById("jobDescCount");
      if (rc) rc.textContent = "0 characters";
      if (jc) jc.textContent = "0 characters";
      showMessage("info", "Cleared. Paste your fresh text to continue.");
    });
  }

  // Save / Load / Clear Draft buttons
  const saveBtn = document.getElementById("saveBtn");
  if (saveBtn) saveBtn.addEventListener("click", saveDraft);
  const loadBtn = document.getElementById("loadBtn");
  if (loadBtn) loadBtn.addEventListener("click", loadDraft);
  const clearDraftBtn = document.getElementById("clearDraftBtn");
  if (clearDraftBtn) clearDraftBtn.addEventListener("click", () => {
    clearDraft();
    showMessage("success", "Draft cleared.");
  });

  // Copy AI bullets
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
        showMessage("error", "Copy failed: " + friendlyError(err));
      }
    });
  }

  // Download DOCX (AI bullets → real .docx via backend)
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
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
        showMessage("success", "Downloaded DOCX. Open it in Word/Pages.");
      } catch (err) {
        showMessage("error", friendlyError(err));
      }
    });
    downloadBtn.addEventListener("click", handler);
  }

  // Resume file upload → /api/extract
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
      // IMPORTANT: backend expects "file" and first/only file
      formData.append("file", file);
      try {
        showMessage("info", "Extracting text from file…");
        const r = await fetch("/api/extract", { method: "POST", body: formData });
        if (!r.ok) throw new Error(await r.text());
        const data = await r.json();
        if (resumeEl) resumeEl.value = data.text || "";
        const resumeCount = document.getElementById("resumeCount");
        if (resumeEl && resumeCount) updateCounterFrom(resumeEl, resumeCount);
        showMessage("success", "File text extracted and added to your resume.");
      } catch (err) {
        showMessage("error", friendlyError(err));
      } finally {
        resumeFileInput.value = ""; // allow re-selecting same file
      }
    });
  }

  // One-click demo filler (Lesson 16)
  const demoBtn = document.getElementById("demoBtn");
  if (demoBtn) {
    demoBtn.addEventListener("click", () => {
      if (resumeEl) {
        resumeEl.value =
`SENIOR OPERATIONS MANAGER
• Led cross-functional team of 12 to deliver 15% cost reduction through process automation (Python + Sheets).
• Owned vendor portfolio ($2.4M/yr); negotiated SLAs, improved on-time delivery to 98%.
• Built reporting dashboards; surfaced KPIs to execs, enabling faster decisions.`;
      }
      if (jdEl) {
        jdEl.value =
`ROLE: Operations Program Manager
• Drive process improvement using data and automation
• Vendor management and contract negotiation
• Build KPI dashboards; partner with engineering + finance
• Excellent communication; cross-functional leadership`;
      }
      // counters & message
      const rc = document.getElementById("resumeCount");
      const jc = document.getElementById("jobDescCount");
      if (resumeEl && rc) updateCounterFrom(resumeEl, rc);
      if (jdEl && jc) updateCounterFrom(jdEl, jc);
      showMessage("success", "Loaded demo resume + job description.");
    });
  }

  // ---------- Draft Resume (beta) actions ----------
  const buildDraftBtn = document.getElementById("buildDraftBtn");
  const downloadDraftBtn = document.getElementById("downloadDraftBtn");

  if (buildDraftBtn) {
    buildDraftBtn.addEventListener("click", () => {
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
    const handler = withLoading(downloadDraftBtn, "Preparing Draft…", async () => {
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
          body: JSON.stringify({ title: "Draft Resume", text })
        });
        if (!r.ok) throw new Error(await r.text());

        const blob = await r.blob();
        const url = URL.createObjectURL(blob);
        const a = document.createElement("a");
        a.href = url;
        a.download = "draft_resume.txt";
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
        showMessage("success", "Draft resume downloaded.");
      } catch (err) {
        showMessage("error", friendlyError(err));
      }
    });
    downloadDraftBtn.addEventListener("click", handler);
  }
});