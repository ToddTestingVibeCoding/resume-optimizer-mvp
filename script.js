// ================================
// Resume Optimizer - script.js
// Production build (Lessons 1–20)
// ================================

// ---------- Config ----------
const BASE_REWRITES_PER_DAY = 5;
const EMAIL_BONUS_REWRITES = 5; // +5 if email provided → 10/day
const AUTOSAVE_DEBOUNCE_MS = 500;

// ---------- LocalStorage keys ----------
const LS_KEYS = {
  resume: "ro.resume",
  jd: "ro.jd",
  savedAt: "ro.savedAt",
  used: "ro.rewritesUsed",
  usedDate: "ro.rewritesDate",
  hasEmail: "ro.hasEmail",
  exportHint: "ro.exportHintSeen"
};

// ---------- Utility ----------
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
  for (const t of tokenize(text)) {
    if (STOPWORDS.has(t)) continue;
    if (t.length < 3) continue;
    counts.set(t, (counts.get(t) || 0) + 1);
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
  const out = [];
  for (const {term, count} of jdTop) {
    if (!resumeCounts.has(term)) out.push({ term, jdCount: count });
  }
  return out;
}
function roughSuggestions(missing) {
  return missing.slice(0, 10).map(({term}) =>
    `Add a quantified bullet using “${term}” in context (tools, metrics, scope).`
  );
}
function renderList(el, items, fmt = (x)=>x) {
  if (!el) return;
  el.innerHTML = "";
  for (const item of items) {
    const li = document.createElement("li");
    li.textContent = fmt(item);
    el.appendChild(li);
  }
}
function debounce(fn, wait) {
  let t;
  return (...args) => {
    clearTimeout(t);
    t = setTimeout(() => fn.apply(null, args), wait);
  };
}
function spinnerHTML(text = "Working…") {
  return `<span class="spinner" aria-hidden="true"></span>${text}`;
}
function friendlyError(err) {
  const msg = err?.message || String(err || "");
  // Common OpenAI / network cases
  if (/rate limit/i.test(msg)) return "We’re hitting a provider rate limit. Please try again in a moment.";
  if (/network|fetch|failed|CORS/i.test(msg)) return "Network hiccup. Check your connection and retry.";
  if (/JSON|Unexpected token/i.test(msg)) return "Server responded unexpectedly. Please retry.";
  if (/Method not allowed|405/i.test(msg)) return "That endpoint is not available with this method.";
  if (/No file uploaded/i.test(msg)) return "No file detected. Choose a .docx, .pdf, or .txt file.";
  return msg;
}

// ---------- Alerts ----------
function showMessage(type, text) {
  // type: info | success | warn | error
  const box = document.getElementById("messages");
  if (!box) return;
  const div = document.createElement("div");
  div.className = `alert ${type}`;
  div.textContent = text;
  box.prepend(div);
  setTimeout(() => div.remove(), 5000);
}

// ---------- Character counters ----------
function updateCounterFrom(el, counterEl) {
  if (!el || !counterEl) return;
  counterEl.textContent = `${(el.value || "").length} characters`;
}
function wireCounters() {
  const resumeEl = document.getElementById("resume");
  const jobDescEl = document.getElementById("jobDesc");
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

// ---------- Save-status badges ----------
function setSavedStatus(which, whenISO) {
  const el = which === "resume" ? document.getElementById("resumeSaved")
                                : document.getElementById("jdSaved");
  if (!el) return;
  if (!whenISO) { el.textContent = "Not saved"; return; }
  const dt = new Date(whenISO);
  el.textContent = `Saved at ${dt.toLocaleTimeString([], { hour: 'numeric', minute:'2-digit' })}`;
}
function refreshSavedStatusFromStorage() {
  const when = localStorage.getItem(LS_KEYS.savedAt);
  setSavedStatus("resume", when);
  setSavedStatus("jd", when);
}

// ---------- Draft save/load ----------
function saveDraft() {
  const resumeEl = document.getElementById("resume");
  const jdEl = document.getElementById("jobDesc");
  if (!resumeEl || !jdEl) return;
  localStorage.setItem(LS_KEYS.resume, resumeEl.value || "");
  localStorage.setItem(LS_KEYS.jd, jdEl.value || "");
  const when = new Date().toISOString();
  localStorage.setItem(LS_KEYS.savedAt, when);
  setSavedStatus("resume", when);
  setSavedStatus("jd", when);
}
function loadDraft() {
  const resumeEl = document.getElementById("resume");
  const jdEl = document.getElementById("jobDesc");
  if (!resumeEl || !jdEl) return;
  const r = localStorage.getItem(LS_KEYS.resume) || "";
  const j = localStorage.getItem(LS_KEYS.jd) || "";
  resumeEl.value = r;
  jdEl.value = j;
  // counters + saved status
  wireCounters();
  refreshSavedStatusFromStorage();
  if (r || j) {
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
  setSavedStatus("resume", null);
  setSavedStatus("jd", null);
}

// ---------- Autosave ----------
const debouncedSaveDraft = debounce(saveDraft, AUTOSAVE_DEBOUNCE_MS);
function wireAutosave() {
  const resumeEl = document.getElementById("resume");
  const jdEl = document.getElementById("jobDesc");
  if (resumeEl) resumeEl.addEventListener("input", debouncedSaveDraft);
  if (jdEl) jdEl.addEventListener("input", debouncedSaveDraft);
}

// ---------- Usage limits ----------
function todayKey() {
  const d = new Date();
  return `${d.getFullYear()}-${d.getMonth()+1}-${d.getDate()}`;
}
function hasEmail() {
  return localStorage.getItem(LS_KEYS.hasEmail) === "1";
}
function maxPerDay() {
  return BASE_REWRITES_PER_DAY + (hasEmail() ? EMAIL_BONUS_REWRITES : 0);
}
function resetDailyIfNewDay() {
  const day = localStorage.getItem(LS_KEYS.usedDate);
  const now = todayKey();
  if (day !== now) {
    localStorage.setItem(LS_KEYS.used, "0");
    localStorage.setItem(LS_KEYS.usedDate, now);
  }
}
function getRewritesUsed() {
  resetDailyIfNewDay();
  return parseInt(localStorage.getItem(LS_KEYS.used) || "0", 10);
}
function incrementRewrites() {
  resetDailyIfNewDay();
  const v = getRewritesUsed() + 1;
  localStorage.setItem(LS_KEYS.used, String(v));
  updateUsageCounter();
}
function updateUsageCounter() {
  const el = document.getElementById("usageCounter");
  if (!el) return;
  el.textContent = `${getRewritesUsed()} / ${maxPerDay()} rewrites used today`;
}

// ---------- Loading helper ----------
function withLoading(btn, labelWhileLoading, fn) {
  return async function(...args) {
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

// ---------- Email modal ----------
function openEmailModal() {
  const modal = document.getElementById("emailModal");
  if (!modal) return;
  modal.setAttribute("aria-hidden", "false");
  modal.classList.add("open");
}
function closeEmailModal() {
  const modal = document.getElementById("emailModal");
  if (!modal) return;
  modal.setAttribute("aria-hidden", "true");
  modal.classList.remove("open");
}
function wireEmailModal() {
  const closeBtn = document.getElementById("emailModalClose");
  const form = document.getElementById("emailForm");
  const input = document.getElementById("emailInput");
  if (closeBtn) closeBtn.addEventListener("click", closeEmailModal);
  if (form) {
    form.addEventListener("submit", (e) => {
      e.preventDefault();
      const email = (input?.value || "").trim();
      if (!email || !/^[^@]+@[^@]+\.[^@]+$/.test(email)) {
        showMessage("warn", "Please enter a valid email.");
        return;
      }
      localStorage.setItem(LS_KEYS.hasEmail, "1");
      closeEmailModal();
      updateUsageCounter();
      showMessage("success", "Thanks! You’ve unlocked 5 extra rewrites per day.");
    });
  }
}

// ---------- Analyze (client-side) ----------
function runAnalyze() {
  const resume = (document.getElementById("resume")?.value || "");
  const jd = (document.getElementById("jobDesc")?.value || "");

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
      <p><strong>Coverage:</strong> ${coverage}% of top JD terms appear in your resume.</p>
      <p><strong>Next step:</strong> Use “Suggested Actions” to weave missing terms into impact bullets.</p>
    `;
  }
  renderList(topJdEl, jdTop, x => `${x.term} (${x.count})`);
  renderList(missingEl, miss, x => x.term);
  renderList(suggestionsEl, sugg);
}

// ---------- Backend calls ----------
async function callRewriteAPI(resume, jd, options) {
  const r = await fetch("/api/rewrite", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ resume, jd, options })
  });
  if (!r.ok) throw new Error(await r.text());
  const data = await r.json();
  return data.bullets || "";
}

// Convert bullets text to <ul> HTML
function bulletsToHTML(bulletsText) {
  return bulletsText
    .split("\n")
    .map(l => l.trim())
    .filter(Boolean)
    .map(l => l.replace(/^[-•*\d.)\s]+/, "")) // strip leading markers
    .map(l => `<li>${l}</li>`)
    .join("");
}
function getCurrentBullets() {
  const summary = document.getElementById("summary");
  const lis = summary ? summary.querySelectorAll("li") : [];
  return Array.from(lis).map(li => li.textContent.trim()).filter(Boolean);
}

// ---------- Wire UI ----------
(function main() {
  // Counters + saved status + autosave
  wireCounters();
  refreshSavedStatusFromStorage();
  wireAutosave();

  // Usage counter (ensure daily reset)
  resetDailyIfNewDay();
  updateUsageCounter();

  // Email modal wiring
  wireEmailModal();

  // ----- Analyze Alignment -----
  const analyzeBtn = document.getElementById("analyzeBtn");
  if (analyzeBtn) {
    const handler = withLoading(analyzeBtn, "Analyzing…", async () => {
      const resume = (document.getElementById("resume")?.value || "").trim();
      const jd = (document.getElementById("jobDesc")?.value || "").trim();
      if (!resume || !jd) {
        showMessage("warn", "Please paste both Resume and Job Description.");
        return;
      }
      runAnalyze();
      showMessage("success", "Alignment analysis complete.");
    });
    analyzeBtn.addEventListener("click", handler);
  }

  // ----- Clear -----
  const clearBtn = document.getElementById("clearBtn");
  if (clearBtn) {
    clearBtn.addEventListener("click", () => {
      const ids = ["resume", "jobDesc", "summary", "draftResume"];
      for (const id of ids) {
        const el = document.getElementById(id);
        if (!el) continue;
        if (el.tagName === "TEXTAREA" || el.tagName === "INPUT") el.value = "";
        else el.innerHTML = "";
      }
      // results lists
      ["topJd","missing","suggestions"].forEach(id => {
        const el = document.getElementById(id);
        if (el) el.innerHTML = "";
      });
      // counters + saved flags
      const rc = document.getElementById("resumeCount");
      const jc = document.getElementById("jobDescCount");
      if (rc) rc.textContent = "0 characters";
      if (jc) jc.textContent = "0 characters";
      clearDraft();
      showMessage("info", "Cleared. Paste your fresh text to continue.");
    });
  }

  // ----- Save/Load/Clear Draft buttons -----
  const saveBtn = document.getElementById("saveBtn");
  if (saveBtn) saveBtn.addEventListener("click", () => { saveDraft(); showMessage("success","Draft saved."); });
  const loadBtn = document.getElementById("loadBtn");
  if (loadBtn) loadBtn.addEventListener("click", loadDraft);
  const clearDraftBtn = document.getElementById("clearDraftBtn");
  if (clearDraftBtn) clearDraftBtn.addEventListener("click", () => { clearDraft(); showMessage("success","Draft cleared."); });

  // ----- Upload Resume File (hidden input flow) -----
  const uploadBtn = document.getElementById("uploadBtn");
  const resumeFileInput = document.getElementById("resumeFile");
  if (uploadBtn && resumeFileInput) {
    uploadBtn.addEventListener("click", () => resumeFileInput.click());
    resumeFileInput.addEventListener("change", async () => {
      const file = resumeFileInput.files?.[0];
      if (!file) { showMessage("warn", "No file selected."); return; }

      const formData = new FormData();
      formData.append("file", file); // IMPORTANT: key must be "file"

      try {
        showMessage("info", "Extracting text from file…");
        const r = await fetch("/api/extract", { method: "POST", body: formData });
        if (!r.ok) throw new Error(await r.text());
        const data = await r.json();
        const resumeEl = document.getElementById("resume");
        if (resumeEl) resumeEl.value = data.text || "";
        wireCounters();
        debouncedSaveDraft(); // autosave the extracted draft
        showMessage("success", "File text extracted and added to your resume.");
      } catch (err) {
        showMessage("error", friendlyError(err));
      } finally {
        resumeFileInput.value = ""; // allow reselecting the same file
      }
    });
  }

  // ----- Rewrite (AI) with limit gates -----
  const rewriteBtn = document.getElementById("rewriteBtn");
  if (rewriteBtn) {
    const handler = withLoading(rewriteBtn, "Rewriting…", async () => {
      const resume = (document.getElementById("resume")?.value || "").trim();
      const jd = (document.getElementById("jobDesc")?.value || "").trim();
      const summary = document.getElementById("summary");
      if (!resume || !jd) {
        showMessage("warn", "Please paste both Resume and Job Description first.");
        return;
      }

      // limit check
      if (getRewritesUsed() >= maxPerDay()) {
        if (!hasEmail()) {
          openEmailModal();
          showMessage("warn", "Daily limit reached. Enter your email to unlock 5 more today.");
        } else {
          showMessage("warn", "Daily limit reached. Try again tomorrow.");
        }
        return;
      }

      // lesson controls
      const tone = (document.getElementById("tone")?.value || "Professional").toLowerCase();
      const seniority = (document.getElementById("seniority")?.value || "Mid").toLowerCase();
      const role = (document.getElementById("role")?.value || "Engineering").toLowerCase();

      if (summary) summary.innerHTML = spinnerHTML("Rewriting with AI…");

      try {
        const bullets = await callRewriteAPI(resume, jd, { tone, seniority, role });
        const html = bulletsToHTML(bullets);
        if (summary) summary.innerHTML = `<h3>AI Suggested Bullets</h3><ul>${html}</ul>`;
        incrementRewrites();
        showMessage("success", `AI rewrite complete. (${getRewritesUsed()}/${maxPerDay()} used today)`);
      } catch (err) {
        if (summary) summary.innerHTML = "";
        showMessage("error", friendlyError(err));
      }
    });
    rewriteBtn.addEventListener("click", handler);
  }

  // ----- Copy AI bullets -----
  const copyBtn = document.getElementById("copyBtn");
  if (copyBtn) {
    copyBtn.addEventListener("click", async () => {
      const bullets = getCurrentBullets();
      if (!bullets.length) { showMessage("warn","No AI bullets to copy yet!"); return; }
      try {
        await navigator.clipboard.writeText(bullets.join("\n"));
        showMessage("success","Copied AI bullets to your clipboard.");
      } catch (err) {
        showMessage("error", "Copy failed: " + (err?.message || err));
      }
    });
  }

  // ----- Download bullets as DOCX -----
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

  // ----- Build Draft Resume from bullets -----
  function buildDraftResume(resumeText, jdText, bullets) {
    const header = `Tailored Resume Draft\n=====================\n`;
    const intro = `This draft aligns your experience to the provided job description.\n\n`;
    const exp = bullets.map((b,i) => `${i+1}. ${b}`).join("\n");
    const tail = `\n\nTips:\n- Personalize metrics, tools, and scope.\n- Keep bullets concise and quantifiable.\n- Mirror high-priority JD terms where truthful.\n`;
    return `${header}${intro}${exp}${tail}`;
  }

  const buildDraftBtn = document.getElementById("buildDraftBtn");
  if (buildDraftBtn) {
    buildDraftBtn.addEventListener("click", () => {
      const resume = (document.getElementById("resume")?.value || "");
      const jd = (document.getElementById("jobDesc")?.value || "");
      const bullets = getCurrentBullets();
      const draftEl = document.getElementById("draftResume");
      if (!bullets.length) {
        showMessage("warn","No AI bullets found. Click “Rewrite for Alignment (AI)” first.");
        return;
      }
      const draft = buildDraftResume(resume, jd, bullets);
      if (draftEl) draftEl.value = draft;
      showMessage("success","Draft built from your AI bullets. Edit freely before downloading.");
    });
  }

  // ----- Download Draft (DOCX via same API) -----
  const downloadDraftBtn = document.getElementById("downloadDraftBtn");
  if (downloadDraftBtn) {
    const handler = withLoading(downloadDraftBtn, "Preparing DOCX…", async () => {
      const draftEl = document.getElementById("draftResume");
      const text = (draftEl?.value || "").trim();
      if (!text) { showMessage("warn","No draft content to download yet."); return; }
      try {
        const r = await fetch("/api/download-docx", {
          method:"POST",
          headers:{ "Content-Type":"application/json" },
          body: JSON.stringify({ title: "Draft Resume", bullets: text.split("\n").filter(Boolean) })
        });
        if (!r.ok) throw new Error(await r.text());
        const blob = await r.blob();
        const url = URL.createObjectURL(blob);
        const a = document.createElement("a");
        a.href = url; a.download = "draft_resume.docx";
        document.body.appendChild(a); a.click(); document.body.removeChild(a);
        URL.revokeObjectURL(url);
        showMessage("success","Draft DOCX downloaded.");
      } catch (err) {
        showMessage("error", friendlyError(err));
      }
    });
    downloadDraftBtn.addEventListener("click", handler);
  }

  // ----- Export session (.json) -----
  const exportBtn = document.getElementById("exportBtn");
  if (exportBtn) {
    exportBtn.addEventListener("click", () => {
      const payload = {
        resume: localStorage.getItem(LS_KEYS.resume) || "",
        jd: localStorage.getItem(LS_KEYS.jd) || "",
        savedAt: localStorage.getItem(LS_KEYS.savedAt) || null,
        used: getRewritesUsed(),
        usedDate: localStorage.getItem(LS_KEYS.usedDate) || todayKey(),
        hasEmail: hasEmail()
      };
      const blob = new Blob([JSON.stringify(payload, null, 2)], { type: "application/json" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url; a.download = "resume_optimizer_session.json";
      document.body.appendChild(a); a.click(); document.body.removeChild(a);
      URL.revokeObjectURL(url);
      if (!localStorage.getItem(LS_KEYS.exportHint)) {
        showMessage("info","Exported. You can import this file later to restore your session.");
        localStorage.setItem(LS_KEYS.exportHint, "1");
      } else {
        showMessage("success","Session exported.");
      }
    });
  }

  // ----- Import session (.json) -----
  const importBtn = document.getElementById("importBtn");
  const importFile = document.getElementById("importFile");
  if (importBtn && importFile) {
    importBtn.addEventListener("click", () => importFile.click());
    importFile.addEventListener("change", async () => {
      const file = importFile.files?.[0];
      if (!file) return;
      try {
        const text = await file.text();
        const data = JSON.parse(text);
        // restore LS + UI
        if (typeof data.resume === "string") localStorage.setItem(LS_KEYS.resume, data.resume);
        if (typeof data.jd === "string") localStorage.setItem(LS_KEYS.jd, data.jd);
        if (typeof data.savedAt === "string") localStorage.setItem(LS_KEYS.savedAt, data.savedAt);
        if (typeof data.used === "number") localStorage.setItem(LS_KEYS.used, String(data.used));
        if (typeof data.usedDate === "string") localStorage.setItem(LS_KEYS.usedDate, data.usedDate);
        if (data.hasEmail) localStorage.setItem(LS_KEYS.hasEmail, "1"); else localStorage.removeItem(LS_KEYS.hasEmail);

        // update editors
        loadDraft();
        updateUsageCounter();
        showMessage("success","Session imported.");
      } catch (err) {
        showMessage("error", "Import failed: " + (err?.message || err));
      } finally {
        importFile.value = "";
      }
    });
  }

  // Optional: prompt to load draft on first visit of the day (gentle)
  (function gentleDraftReminder() {
    const resumeLS = localStorage.getItem(LS_KEYS.resume) || "";
    const jdLS = localStorage.getItem(LS_KEYS.jd) || "";
    if (resumeLS || jdLS) {
      // Soft nudge
      showMessage("info","You have a saved draft. Click “Load Draft” if you want to continue where you left off.");
    }
  })();
})();