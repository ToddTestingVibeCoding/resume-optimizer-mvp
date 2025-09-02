// =====================================
// Resume Optimizer - Full Script (Lessons 1–19)
// =====================================

// ---------- Config ----------
const BASE_REWRITES_PER_DAY = 5;
const EMAIL_BONUS_REWRITES = 5; // +5 if email collected
const AUTOSAVE_DEBOUNCE_MS = 500;

// ---------- LocalStorage Keys ----------
const LS_KEYS = {
  resume: "ro.resume",
  jd: "ro.jd",
  savedAt: "ro.savedAt",
  used: "ro.rewritesUsed",
  usedDate: "ro.rewritesDate",
  email: "ro.userEmail",
  session: "ro.sessionJSON",
};

// ---------- Utilities ----------
function debounce(fn, wait = 300) {
  let t;
  return (...args) => {
    clearTimeout(t);
    t = setTimeout(() => fn(...args), wait);
  };
}

function todayKey() {
  const d = new Date();
  return d.toISOString().slice(0, 10);
}

// ---------- Messaging / Alerts ----------
function showMessage(type, text) {
  // types: info | success | warn | error
  let box = document.getElementById("messages");
  if (!box) {
    box = document.getElementById("summary"); // fallback
  }
  if (!box) return;
  const div = document.createElement("div");
  div.className = `alert ${type}`;
  div.textContent = text;
  box.prepend(div);
  setTimeout(() => {
    if (div && div.parentNode) div.parentNode.removeChild(div);
  }, 5000);
}

function friendlyError(err) {
  const msg = (err?.message || err || "").toString();
  if (msg.includes("invalid_api_key")) {
    return "AI key is missing/invalid. Check Vercel ENV (OPENAI_API_KEY).";
  }
  if (msg.includes("rate_limit") || msg.includes("Rate limit")) {
    return "The AI is busy (rate limited). Please wait a bit and try again.";
  }
  if (/FUNCTION_INVOCATION_FAILED|INTERNAL|500/.test(msg)) {
    return "Server hiccup. Try again in a moment.";
  }
  if (msg.includes("No file uploaded")) {
    return "No file detected. Please choose a .docx, .pdf, or .txt and try again.";
  }
  return msg;
}

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

// ---------- Character Counters ----------
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

// ---------- Tokenizing / Keyword Stats ----------
const STOPWORDS = new Set([
  "the", "and", "or", "to", "a", "of", "in", "for", "on", "with", "is", "are",
  "as", "at", "by", "an", "be", "this", "that", "from", "it", "you", "your",
  "we", "our", "their", "they", "will", "can", "ability", "responsible",
  "responsibilities", "experience", "years"
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
    `Add a bullet using “${term}” in context (quantified impact or tool usage).`
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

// ---------- JD-Term Highlighter (Lesson 19) ----------
function highlightTerms(baseText, terms) {
  if (!baseText || !terms?.length) return baseText;
  const escaped = terms.map(t => t.term.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"));
  if (!escaped.length) return baseText;
  const re = new RegExp(`\\b(${escaped.join("|")})\\b`, "gi");
  return baseText.replace(re, (m) => `<mark>${m}</mark>`);
}
function refreshResumeMirror() {
  const mirror = document.getElementById("resumeMirror");
  const resumeEl = document.getElementById("resume");
  const jobDescEl = document.getElementById("jobDesc") || document.getElementById("jd");
  const toggle = document.getElementById("highlightToggle");
  if (!mirror || !resumeEl || !jobDescEl || !toggle) return;

  if (!toggle.checked) {
    mirror.innerHTML = (resumeEl.value || "")
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/\n/g, "<br>");
    return;
  }

  const jdCounts = keywordCounts(jobDescEl.value || "");
  const jdTop = topTerms(jdCounts, 20);
  const html = highlightTerms(
    (resumeEl.value || "")
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;"),
    jdTop
  ).replace(/\n/g, "<br>");

  mirror.innerHTML = html;
}
function wireHighlighter() {
  const resumeEl = document.getElementById("resume");
  const jdEl = document.getElementById("jobDesc") || document.getElementById("jd");
  const toggle = document.getElementById("highlightToggle");
  if (!resumeEl || !jdEl || !toggle) return;
  const refresh = debounce(refreshResumeMirror, 150);
  toggle.addEventListener("change", refresh);
  resumeEl.addEventListener("input", refresh);
  jdEl.addEventListener("input", refresh);
  refresh();
}

// ---------- Usage Limits + Email Unlock ----------
function getQuotaLimit() {
  return getStoredEmail() ? BASE_REWRITES_PER_DAY + EMAIL_BONUS_REWRITES : BASE_REWRITES_PER_DAY;
}
function getRewritesUsed() {
  const day = localStorage.getItem(LS_KEYS.usedDate);
  if (day !== todayKey()) {
    localStorage.setItem(LS_KEYS.usedDate, todayKey());
    localStorage.setItem(LS_KEYS.used, "0");
    return 0;
  }
  return parseInt(localStorage.getItem(LS_KEYS.used) || "0", 10);
}
function incrementRewrites() {
  const used = getRewritesUsed() + 1;
  localStorage.setItem(LS_KEYS.usedDate, todayKey());
  localStorage.setItem(LS_KEYS.used, String(used));
  updateUsageCounter();
}
function updateUsageCounter() {
  const el = document.getElementById("usageCounter");
  if (!el) return;
  el.textContent = `${getRewritesUsed()} / ${getQuotaLimit()} rewrites used today`;
}

// Email capture modal (graceful if modal not present)
function getStoredEmail() {
  return localStorage.getItem(LS_KEYS.email) || "";
}
function askForEmailIfNeeded() {
  const used = getRewritesUsed();
  if (used < BASE_REWRITES_PER_DAY) return false; // still under free quota
  if (getStoredEmail()) return false; // already unlocked

  const modal = document.getElementById("modalEmail");
  if (!modal) return false;

  modal.style.display = "block";

  const close = () => (modal.style.display = "none");
  const cancelBtn = document.getElementById("emailCancelBtn");
  const submitBtn = document.getElementById("emailSubmitBtn");
  const input = document.getElementById("emailInput");
  const closeX = document.getElementById("emailCloseBtn");

  if (cancelBtn) cancelBtn.onclick = close;
  if (closeX) closeX.onclick = close;
  if (submitBtn && input) {
    submitBtn.onclick = () => {
      const val = (input.value || "").trim();
      if (!val || !/\S+@\S+\.\S+/.test(val)) {
        showMessage("warn", "Please enter a valid email.");
        return;
      }
      localStorage.setItem(LS_KEYS.email, val);
      close();
      updateUsageCounter();
      showMessage("success", "Thanks! Extra daily rewrites unlocked.");
    };
  }
  return true;
}

// ---------- Draft Save / Load / Clear + Autosave ----------
function saveDraft() {
  const resumeEl = document.getElementById("resume");
  const jdEl = document.getElementById("jobDesc") || document.getElementById("jd");
  if (!resumeEl || !jdEl) return;

  localStorage.setItem(LS_KEYS.resume, resumeEl.value || "");
  localStorage.setItem(LS_KEYS.jd, jdEl.value || "");
  localStorage.setItem(LS_KEYS.savedAt, new Date().toISOString());
  setSavedStatus("resume", localStorage.getItem(LS_KEYS.savedAt));
  setSavedStatus("jd", localStorage.getItem(LS_KEYS.savedAt));
}
function loadDraft() {
  const resumeEl = document.getElementById("resume");
  const jdEl = document.getElementById("jobDesc") || document.getElementById("jd");
  if (!resumeEl || !jdEl) return;

  const resume = localStorage.getItem(LS_KEYS.resume) || "";
  const jd = localStorage.getItem(LS_KEYS.jd) || "";
  resumeEl.value = resume;
  jdEl.value = jd;

  const resumeCount = document.getElementById("resumeCount");
  const jdCount = document.getElementById("jobDescCount");
  if (resumeCount) updateCounterFrom(resumeEl, resumeCount);
  if (jdCount) updateCounterFrom(jdEl, jdCount);

  refreshResumeMirror();

  const when = localStorage.getItem(LS_KEYS.savedAt);
  if (resume || jd) {
    showMessage("info", when ? `Draft loaded (saved ${new Date(when).toLocaleString()}).` : "Draft loaded.");
  } else {
    showMessage("warn", "No saved draft found.");
  }
  setSavedStatus("resume", when);
  setSavedStatus("jd", when);
}
function clearDraft() {
  localStorage.removeItem(LS_KEYS.resume);
  localStorage.removeItem(LS_KEYS.jd);
  localStorage.removeItem(LS_KEYS.savedAt);
  setSavedStatus("resume", null);
  setSavedStatus("jd", null);
}
const debouncedSave = debounce(saveDraft, AUTOSAVE_DEBOUNCE_MS);

// Saved-at badges
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

// Restore banner (offer to load saved draft once)
function maybeShowRestoreBanner() {
  const resume = localStorage.getItem(LS_KEYS.resume) || "";
  const jd = localStorage.getItem(LS_KEYS.jd) || "";
  const when = localStorage.getItem(LS_KEYS.savedAt);
  if (!resume && !jd) return;

  const box = document.getElementById("messages");
  if (!box) return;

  const div = document.createElement("div");
  div.className = "alert info";
  div.innerHTML = `
    Found a saved draft ${when ? `from ${new Date(when).toLocaleString()}` : ""}.
    <button id="restoreDraftBtn" class="pillbtn">Load Draft</button>
    <button id="dismissDraftBtn" class="pillbtn">Dismiss</button>
  `;
  box.prepend(div);

  const restoreBtn = document.getElementById("restoreDraftBtn");
  const dismissBtn = document.getElementById("dismissDraftBtn");
  if (restoreBtn) restoreBtn.onclick = () => { loadDraft(); div.remove(); };
  if (dismissBtn) dismissBtn.onclick = () => div.remove();
}

// ---------- Analyze (no AI) ----------
(function wireAnalyze(){
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

    // Local analysis
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
        </div>
      `;
    }
    renderList(topJdEl, jdTop, x => `${x.term} (${x.count})`);
    renderList(missingEl, miss, x => x.term);
    renderList(suggestionsEl, sugg);

    refreshResumeMirror();
    showMessage("success", "Alignment analysis complete.");
  });

  analyzeBtn.addEventListener("click", handler);
})();

// ---------- AI Rewrite (secure backend) ----------
async function callRewriteAPI(resume, jd, opts = {}) {
  const r = await fetch("/api/rewrite", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ resume, jd, ...opts }),
  });
  if (!r.ok) {
    const t = await r.text();
    throw new Error(`Rewrite failed: ${t}`);
  }
  const data = await r.json();
  return data.bullets || "";
}

(function wireRewrite(){
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
    const limit = getQuotaLimit();
    if (used >= limit) {
      if (!getStoredEmail()) {
        const opened = askForEmailIfNeeded();
        if (opened) return; // wait for email
      } else {
        showMessage("warn", "Daily limit reached. Please come back tomorrow.");
        return;
      }
    }

    if (summary) summary.innerHTML = spinnerHTML("Rewriting with AI…");

    // Lesson 7 controls (graceful if absent)
    const tone = (document.getElementById("tone")?.value || "Professional").toLowerCase();
    const seniority = (document.getElementById("seniority")?.value || "Mid").toLowerCase();
    const role = (document.getElementById("role")?.value || "General").toLowerCase();

    try {
      const bullets = await callRewriteAPI(resume, jd, { tone, seniority, role });

      const html = bullets
        .split("\n")
        .map(l => l.trim())
        .filter(Boolean)
        .map(l => l.replace(/^[-•*\d.)\s]+/, ""))
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
      showMessage("success", `AI rewrite complete. (${getRewritesUsed()}/${getQuotaLimit()} used today)`);
      refreshResumeMirror();
    } catch (e) {
      if (summary) summary.innerHTML = "";
      showMessage("error", friendlyError(e));
    }
  });

  rewriteBtn.addEventListener("click", handler);
})();

// ---------- Copy + Download Bullets ----------
function getCurrentBullets() {
  const summary = document.getElementById("summary");
  const lis = summary ? summary.querySelectorAll("li") : [];
  return Array.from(lis).map(li => li.textContent.trim()).filter(Boolean);
}

(function wireCopyDownloadBullets(){
  // Copy
  const copyBtn = document.getElementById("copyBtn");
  if (copyBtn){
    copyBtn.addEventListener("click", async ()=>{
      const bullets = getCurrentBullets();
      if(!bullets.length){ showMessage("warn","No AI bullets to copy yet!"); return; }
      try{
        await navigator.clipboard.writeText(bullets.join("\n"));
        showMessage("success","Copied AI bullets to your clipboard.");
      }catch(err){ showMessage("error","Copy failed: "+(err?.message||err)); }
    });
  }

  // Download DOCX via backend
  const downloadBtn = document.getElementById("downloadBtn");
  if (downloadBtn){
    const handler = withLoading(downloadBtn, "Preparing DOCX…", async () => {
      const bullets = getCurrentBullets();
      if(!bullets.length){ showMessage("warn","No AI bullets to download yet!"); return; }
      try{
        const r = await fetch("/api/download-docx", {
          method:"POST",
          headers:{ "Content-Type":"application/json" },
          body: JSON.stringify({ title:"AI Suggested Resume Bullets", bullets })
        });
        if(!r.ok) throw new Error(await r.text());
        const blob = await r.blob();
        const url = URL.createObjectURL(blob);
        const a = document.createElement("a");
        a.href = url; a.download = "ai_resume_bullets.docx";
        document.body.appendChild(a); a.click(); document.body.removeChild(a);
        URL.revokeObjectURL(url);
        showMessage("success","Downloaded DOCX. Open it in Word/Pages.");
      }catch(err){ showMessage("error", friendlyError(err)); }
    });
    downloadBtn.addEventListener("click", handler);
  }
})();

// ---------- Build Draft from Bullets + Download Draft DOCX ----------
function buildDraftResume(resumeText, jobDescText, bulletsArr) {
  const lines = [
    "Tailored Resume Draft",
    "",
    "Professional Summary",
    "• Results-oriented professional aligning closely with the role requirements.",
    "",
    "Key Impact Bullets",
    ...bulletsArr.map(b => `• ${b}`),
    "",
    "Selected Experience",
    resumeText || "(Paste your experience above to enrich this section.)",
    "",
    "Job Description (for reference)",
    jobDescText || "(Paste the job description above.)"
  ];
  return lines.join("\n");
}

(function wireDraft(){
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
    const handler = withLoading(downloadDraftBtn, "Preparing Draft…", async () => {
      const draftEl = document.getElementById("draftResume");
      const text = (draftEl?.value || "").trim();
      if (!text) {
        showMessage("warn", "No draft content to download yet. Click “Build Draft from Bullets” first.");
        return;
      }
      try {
        const r = await fetch("/api/download-draft-docx", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ title: "Tailored_Resume_Draft", text })
        });
        if (!r.ok) throw new Error(await r.text());
        const blob = await r.blob();
        const url = URL.createObjectURL(blob);
        const a = document.createElement("a");
        a.href = url; a.download = "tailored_resume_draft.docx";
        document.body.appendChild(a); a.click(); document.body.removeChild(a);
        URL.revokeObjectURL(url);
        showMessage("success", "Downloaded Draft (DOCX).");
      } catch (e) {
        showMessage("error", friendlyError(e));
      }
    });
    downloadDraftBtn.addEventListener("click", handler);
  }
})();

// ---------- Resume File Upload → /api/extract ----------
(function wireUpload(){
  const uploadBtn = document.getElementById("uploadBtn");
  const resumeFileInput = document.getElementById("resumeFile");
  if (!uploadBtn || !resumeFileInput) return;

  uploadBtn.addEventListener("click", () => resumeFileInput.click());

  resumeFileInput.addEventListener("change", async () => {
    const file = resumeFileInput.files?.[0];
    if (!file) { showMessage("warn", "No file selected."); return; }

    const originalHTML = uploadBtn.innerHTML;
    uploadBtn.disabled = true;
    uploadBtn.innerHTML = `<span class="spinner"></span>Uploading…`;

    const formData = new FormData();
    formData.append("file", file); // key must be "file"

    try {
      const r = await fetch("/api/extract", { method: "POST", body: formData });
      if (!r.ok) throw new Error(await r.text());
      const data = await r.json();

      const resumeEl = document.getElementById("resume");
      if (resumeEl) {
        resumeEl.value = data.text || "";
        saveDraft(); // persist immediately
        const resumeCount = document.getElementById("resumeCount");
        if (resumeCount) updateCounterFrom(resumeEl, resumeCount);
        refreshResumeMirror();
      }
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

// ---------- Clear ----------
(function wireClear(){
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
    clearDraft();
    const resumeCount = document.getElementById("resumeCount");
    if (resumeCount) resumeCount.textContent = "0 characters";
    const jdCount = document.getElementById("jobDescCount");
    if (jdCount) jdCount.textContent = "0 characters";
    refreshResumeMirror();
    showMessage("info", "Cleared. Paste your fresh text to continue.");
  });
})();

// ---------- Draft Save/Load/Clear Buttons ----------
(function wireDraftButtons(){
  const saveBtn = document.getElementById("saveBtn");
  if (saveBtn) saveBtn.addEventListener("click", () => { saveDraft(); showMessage("success","Draft saved."); });

  const loadBtn = document.getElementById("loadBtn");
  if (loadBtn) loadBtn.addEventListener("click", () => loadDraft());

  const clearDraftBtn = document.getElementById("clearDraftBtn");
  if (clearDraftBtn) clearDraftBtn.addEventListener("click", () => { clearDraft(); showMessage("success","Draft cleared."); });

  function onAnyInputAutosave(){
    const resumeEl = document.getElementById("resume");
    const jobDescEl = document.getElementById("jobDesc") || document.getElementById("jd");
    if (resumeEl) resumeEl.addEventListener("input", () => { debouncedSave(); refreshResumeMirror(); });
    if (jobDescEl) jobDescEl.addEventListener("input", () => { debouncedSave(); refreshResumeMirror(); });
  }
  onAnyInputAutosave();
})();

// ---------- Session Export / Import (Lesson 19) ----------
(function wireSessionIO(){
  const exportBtn = document.getElementById("exportBtn");
  const importBtn = document.getElementById("importBtn");
  const importFile = document.getElementById("importFile");

  if (exportBtn) {
    exportBtn.addEventListener("click", () => {
      const payload = {
        resume: localStorage.getItem(LS_KEYS.resume) || "",
        jd: localStorage.getItem(LS_KEYS.jd) || "",
        savedAt: localStorage.getItem(LS_KEYS.savedAt) || "",
        used: getRewritesUsed(),
        usedDate: localStorage.getItem(LS_KEYS.usedDate) || todayKey(),
        email: getStoredEmail() || "",
      };
      const blob = new Blob([JSON.stringify(payload, null, 2)], { type: "application/json" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url; a.download = `resume_optimizer_session_${Date.now()}.json`;
      document.body.appendChild(a); a.click(); document.body.removeChild(a);
      URL.revokeObjectURL(url);
      showMessage("success", "Session exported as JSON.");
    });
  }

  if (importBtn && importFile) {
    importBtn.addEventListener("click", () => importFile.click());
    importFile.addEventListener("change", async () => {
      const file = importFile.files?.[0];
      if (!file) return;
      try {
        const text = await file.text();
        const data = JSON.parse(text);
        // restore
        if (typeof data.resume === "string") localStorage.setItem(LS_KEYS.resume, data.resume);
        if (typeof data.jd === "string") localStorage.setItem(LS_KEYS.jd, data.jd);
        if (typeof data.savedAt === "string") localStorage.setItem(LS_KEYS.savedAt, data.savedAt);
        if (typeof data.email === "string") localStorage.setItem(LS_KEYS.email, data.email);
        if (typeof data.used === "number") localStorage.setItem(LS_KEYS.used, String(data.used));
        if (typeof data.usedDate === "string") localStorage.setItem(LS_KEYS.usedDate, data.usedDate);

        // load into UI
        loadDraft();
        updateUsageCounter();
        showMessage("success", "Session imported.");
      } catch (e) {
        showMessage("error", "Import failed: " + (e?.message || e));
      } finally {
        importFile.value = "";
      }
    });
  }
})();

// ---------- Init on page load ----------
(function init(){
  wireCounters();
  updateUsageCounter();
  refreshSavedStatusFromStorage();
  maybeShowRestoreBanner();
  wireHighlighter(); // JD term highlighting overlay
})();