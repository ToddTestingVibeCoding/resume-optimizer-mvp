// ================================
// Resume Optimizer — script.js (Lessons 1–17)
// Production-ready consolidated file
// ================================

// ---------- Config ----------
const BASE_REWRITES_PER_DAY = 5;
const EMAIL_BONUS_REWRITES = 5; // total becomes 10/day after email
const AUTOSAVE_DEBOUNCE_MS = 400;

// ---- LocalStorage keys
const LS_KEYS = {
  resume: "ro.resume",
  jd: "ro.jd",
  savedAt: "ro.savedAt",
  // usage
  rewritesUsed: "ro.rewrites.used",
  rewritesDate: "ro.rewrites.date",
  emailProvided: "ro.email.provided",
  // optional saved controls (future-proofing)
  tone: "ro.tone",
  seniority: "ro.seniority",
  role: "ro.role",
};

// ---------- DOM helpers ----------
function $(id) { return document.getElementById(id); }

// ---------- Messaging ----------
function showMessage(type, text) {
  // types: info | success | warn | error
  let box = $("messages");
  if (!box) box = $("summary"); // fallback location
  if (!box) return;
  const div = document.createElement("div");
  div.className = `alert ${type}`;
  div.textContent = text;
  box.prepend(div);
  setTimeout(() => { if (div.parentNode) div.parentNode.removeChild(div); }, 5000);
}
function friendlyError(err) {
  const msg = (typeof err === "string" ? err : (err?.message || "")).toLowerCase();

  if (msg.includes("invalid_api_key") || msg.includes("incorrect api key")) {
    return "API key misconfigured on the server. (Owner action: set OPENAI_API_KEY in Vercel → Settings → Environment Variables, then redeploy.)";
  }
  if (msg.includes("rate limit") || msg.includes("rpm")) {
    return "AI is busy (rate limit). Please try again in a moment.";
  }
  if (msg.includes("no file uploaded")) {
    return "No file received. Click “Upload Resume File” and pick a .docx/.pdf/.txt.";
  }
  if (msg.includes("unsupported file")) {
    return "Unsupported file type. Please upload .docx, .pdf, or .txt.";
  }
  if (msg.includes("extract")) {
    return "Couldn’t extract text from the file. Try a different format or plain text.";
  }
  if (msg.includes("not found") && msg.includes("/api/")) {
    return "That download endpoint isn’t deployed yet. Make sure the API file exists and redeploy.";
  }
  return (typeof err === "string") ? err : (err?.message || "Something went wrong.");
}

// ---------- Loading helpers ----------
function withLoading(btn, labelWhileLoading, fn) {
  return async function(...args) {
    let original;
    if (btn) { btn.disabled = true; original = btn.innerHTML; btn.innerHTML = labelWhileLoading; }
    try { return await fn(...args); }
    finally { if (btn) { btn.disabled = false; btn.innerHTML = original; } }
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

// ---------- Debounce ----------
function debounce(fn, wait = 300) {
  let t;
  return function(...args) {
    clearTimeout(t);
    t = setTimeout(() => fn.apply(this, args), wait);
  };
}

// ---------- Draft save/load helpers ----------
function saveDraft() {
  const resumeEl = $("resume");
  const jdEl = $("jobDesc") || $("jd");
  if (!resumeEl || !jdEl) return;
  localStorage.setItem(LS_KEYS.resume, resumeEl.value || "");
  localStorage.setItem(LS_KEYS.jd, jdEl.value || "");
  localStorage.setItem(LS_KEYS.savedAt, new Date().toISOString());
  showMessage("success", "Draft saved.");
}
function loadDraft() {
  const resumeEl = $("resume");
  const jdEl = $("jobDesc") || $("jd");
  if (!resumeEl || !jdEl) return;

  const resume = localStorage.getItem(LS_KEYS.resume) || "";
  const jd = localStorage.getItem(LS_KEYS.jd) || "";
  resumeEl.value = resume;
  jdEl.value = jd;

  // Refresh counters if present
  const resumeCount = $("resumeCount");
  const jobDescCount = $("jobDescCount");
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

// Nice banner asking to load a saved draft (if it exists)
function maybeOfferLoadDraft() {
  const savedResume = localStorage.getItem(LS_KEYS.resume) || "";
  const savedJd = localStorage.getItem(LS_KEYS.jd) || "";
  if (!savedResume && !savedJd) return;

  const box = $("messages") || $("summary");
  if (!box) return;

  const div = document.createElement("div");
  div.className = "alert info";
  div.innerHTML = `
    You have a saved draft from a previous session.
    <button id="bannerLoadBtn" class="linklike">Load it</button>
    <button id="bannerDismissBtn" class="linklike">Dismiss</button>
  `;
  box.prepend(div);

  const loadBtn = $("bannerLoadBtn");
  const dismissBtn = $("bannerDismissBtn");
  if (loadBtn) loadBtn.addEventListener("click", () => {
    loadDraft();
    if (div.parentNode) div.parentNode.removeChild(div);
  });
  if (dismissBtn) dismissBtn.addEventListener("click", () => {
    if (div.parentNode) div.parentNode.removeChild(div);
  });
}

// ---------- Usage limits + email unlock ----------
function todayStr() { return new Date().toISOString().slice(0,10); }
function isNewDay() { return localStorage.getItem(LS_KEYS.rewritesDate) !== todayStr(); }
function resetDailyUsage() {
  localStorage.setItem(LS_KEYS.rewritesDate, todayStr());
  localStorage.setItem(LS_KEYS.rewritesUsed, "0");
}
function getRewritesUsed() {
  if (isNewDay()) resetDailyUsage();
  return parseInt(localStorage.getItem(LS_KEYS.rewritesUsed) || "0", 10);
}
function incrementRewrites() {
  if (isNewDay()) resetDailyUsage();
  const n = getRewritesUsed() + 1;
  localStorage.setItem(LS_KEYS.rewritesUsed, String(n));
  updateUsageCounter();
}
function hasEmailBonus() {
  return !!localStorage.getItem(LS_KEYS.emailProvided);
}
function getMaxRewrites() {
  return BASE_REWRITES_PER_DAY + (hasEmailBonus() ? EMAIL_BONUS_REWRITES : 0);
}
function isLocked() {
  return getRewritesUsed() >= getMaxRewrites();
}
function updateUsageCounter() {
  const el = $("usageCounter");
  if (el) el.textContent = `${getRewritesUsed()} / ${getMaxRewrites()} rewrites used today`;
}

// Email unlock modal handlers (expects elements with these IDs to exist in index.html)
function wireEmailModal() {
  const modal = $("emailModal");
  const overlay = $("modalOverlay");
  const input = $("emailInput");
  const submitBtn = $("emailSubmitBtn");
  const cancelBtn = $("emailCancelBtn");

  if (!modal || !overlay || !input || !submitBtn || !cancelBtn) return;

  function open() {
    modal.classList.add("open");
    overlay.classList.add("open");
    input.value = "";
    input.focus();
  }
  function close() {
    modal.classList.remove("open");
    overlay.classList.remove("open");
  }
  submitBtn.addEventListener("click", () => {
    const val = input.value.trim();
    if (!val || !val.includes("@")) {
      showMessage("warn", "Please enter a valid email.");
      return;
    }
    localStorage.setItem(LS_KEYS.emailProvided, val);
    updateUsageCounter();
    showMessage("success", "Thanks! You now have 10 rewrites/day.");
    close();
  });
  cancelBtn.addEventListener("click", () => close());
  overlay.addEventListener("click", () => close());

  // expose globally for use in rewrite flow
  window.__openEmailModal = open;
}
function openEmailModalIfLocked() {
  if (typeof window.__openEmailModal === "function") window.__openEmailModal();
  else showMessage("warn", "Daily limit reached. Enter your email to unlock more.");
}

// ---------- Analyze (backend) ----------
function setResults(html) {
  const summary = $("summary");
  if (!summary) return;
  summary.innerHTML = html;
}
function appendList(containerId, items, formatter = (x)=>x) {
  const el = $(containerId);
  if (!el) return;
  el.innerHTML = "";
  for (const item of items) {
    const li = document.createElement("li");
    li.textContent = formatter(item);
    el.appendChild(li);
  }
}

// Analyze button
(function wireAnalyze(){
  const analyzeBtn = $("analyzeBtn");
  if (!analyzeBtn) return;

  const handler = withLoading(analyzeBtn, spinnerHTML("Analyzing…"), async () => {
    const resume = ($("resume")?.value || "").trim();
    const jobDesc =
      ($("jobDesc")?.value || $("jd")?.value || "").trim();
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

      // Expected shape:
      // { analysis: string, topTerms: [{term,count}], missingTerms: [string], suggestions: [string] }
      setResults(`
        <div class="card">
          <h3>Alignment Analysis</h3>
          <p>${(data.analysis || "").replace(/\n/g, "<br>")}</p>
        </div>
      `);
      appendList("topJd", (data.topTerms || []), x => `${x.term} (${x.count})`);
      appendList("missing", (data.missingTerms || []), x => x);
      appendList("suggestions", (data.suggestions || []), x => x);
      showMessage("success", "Alignment analysis complete.");
    } catch (err) {
      showMessage("error", friendlyError(err));
    }
  });

  analyzeBtn.addEventListener("click", handler);
})();

// ---------- Rewrite (backend) + usage gating ----------
async function callRewriteAPI(resume, jd, opts) {
  const r = await fetch("/api/rewrite", {
    method: "POST",
    headers: { "Content-Type":"application/json" },
    body: JSON.stringify({ resume, jd, ...opts })
  });
  if (!r.ok) throw new Error(await r.text());
  const data = await r.json();
  return data.bullets || "";
}

(function wireRewrite(){
  const rewriteBtn = $("rewriteBtn");
  if (!rewriteBtn) return;

  const handler = withLoading(rewriteBtn, spinnerHTML("Rewriting…"), async () => {
    const resume = ($("resume")?.value || "").trim();
    const jd = ($("jobDesc")?.value || $("jd")?.value || "").trim();
    if (!resume || !jd) {
      showMessage("warn", "Please paste both Resume and Job Description first.");
      return;
    }

    // Daily limit check
    if (isLocked()) {
      openEmailModalIfLocked();
      return;
    }

    // Controls (may or may not exist in your UI)
    const tone = ($("tone")?.value || "Professional").toLowerCase();
    const seniority = ($("seniority")?.value || "Mid").toLowerCase();
    const role = ($("role")?.value || "General").toLowerCase();

    // Call backend
    try {
      const bullets = await callRewriteAPI(resume, jd, { tone, seniority, role });
      const html = bullets
        .split("\n")
        .map(l => l.trim())
        .filter(Boolean)
        .map(l => l.replace(/^[-•*\d.)\s]+/, "")) // strip markers
        .map(l => `<li>${l}</li>`)
        .join("");

      const summary = $("summary");
      if (summary) summary.innerHTML = `<h3>AI Suggested Bullets</h3><ul>${html}</ul>`;

      incrementRewrites();
      showMessage("success", `AI rewrite complete. (${getRewritesUsed()}/${getMaxRewrites()} used today)`);
    } catch (err) {
      showMessage("error", friendlyError(err));
    }
  });

  rewriteBtn.addEventListener("click", handler);
})();

// ---------- Copy + Download (bullets) ----------
function getCurrentBullets() {
  const summary = $("summary");
  const lis = summary ? summary.querySelectorAll("li") : [];
  return Array.from(lis).map(li => li.textContent.trim()).filter(Boolean);
}

// Copy bullets
(function wireCopy(){
  const copyBtn = $("copyBtn");
  if (!copyBtn) return;
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
})();

// Download bullets as DOCX via backend
(function wireDownloadBullets(){
  const downloadBtn = $("downloadBtn");
  if (!downloadBtn) return;

  const handler = withLoading(downloadBtn, spinnerHTML("Preparing DOCX…"), async () => {
    const bullets = getCurrentBullets();
    if (!bullets.length) { showMessage("warn", "No AI bullets to download yet!"); return; }
    try {
      const r = await fetch("/api/download-docx", {
        method:"POST",
        headers:{ "Content-Type":"application/json" },
        body: JSON.stringify({ title:"AI Suggested Resume Bullets", bullets })
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
})();

// ---------- Upload (resume file → extract) ----------
(function wireUpload(){
  const uploadBtn = $("uploadBtn");
  const resumeFileInput = $("resumeFile");
  if (!uploadBtn || !resumeFileInput) return;

  // Open hidden file input
  uploadBtn.addEventListener("click", () => resumeFileInput.click());

  // Send chosen file to backend (FormData)
  resumeFileInput.addEventListener("change", async () => {
    const file = resumeFileInput.files?.[0];
    if (!file) { showMessage("warn", "No file selected."); return; }

    const formData = new FormData();
    formData.append("file", file); // IMPORTANT: key must be "file"

    const originalHTML = uploadBtn.innerHTML;
    uploadBtn.disabled = true;
    uploadBtn.innerHTML = spinnerHTML("Extracting…");

    try {
      const r = await fetch("/api/extract", { method: "POST", body: formData });
      if (!r.ok) throw new Error(await r.text());
      const data = await r.json();
      const resumeEl = $("resume");
      if (resumeEl) resumeEl.value = data.text || "";
      const resumeCount = $("resumeCount");
      if (resumeEl && resumeCount) updateCounterFrom(resumeEl, resumeCount);
      showMessage("success", "File text extracted and added to your resume.");
    } catch (err) {
      showMessage("error", friendlyError(err));
    } finally {
      uploadBtn.disabled = false;
      uploadBtn.innerHTML = originalHTML;
      resumeFileInput.value = ""; // allow re-select same file
    }
  });
})();

// ---------- Clear ----------
(function wireClear(){
  const clearBtn = $("clearBtn");
  if (!clearBtn) return;

  clearBtn.addEventListener("click", () => {
    const ids = ["resume","jobDesc","jd","summary","draftResume","topJd","missing","suggestions"];
    for (const id of ids) {
      const el = $(id);
      if (!el) continue;
      if (el.tagName === "TEXTAREA" || el.tagName === "INPUT") el.value = "";
      else el.innerHTML = "";
    }
    clearDraft();

    const resumeCount = $("resumeCount");
    if (resumeCount) resumeCount.textContent = "0 characters";
    const jdCount = $("jobDescCount");
    if (jdCount) jdCount.textContent = "0 characters";

    showMessage("info", "Cleared. Paste your fresh text to continue.");
  });
})();

// ---------- Save / Load / Clear Draft buttons ----------
(function wireDraftButtons(){
  const saveBtn = $("saveBtn");
  const loadBtn = $("loadBtn");
  const clearDraftBtn = $("clearDraftBtn");
  if (saveBtn) saveBtn.addEventListener("click", saveDraft);
  if (loadBtn) loadBtn.addEventListener("click", loadDraft);
  if (clearDraftBtn) clearDraftBtn.addEventListener("click", () => {
    clearDraft();
    showMessage("success", "Draft cleared.");
  });

  // Autosave (resume + jd)
  const resumeEl = $("resume");
  const jdEl = $("jobDesc") || $("jd");
  if (resumeEl && jdEl) {
    const debouncedSave = debounce(saveDraft, AUTOSAVE_DEBOUNCE_MS);
    resumeEl.addEventListener("input", debouncedSave);
    jdEl.addEventListener("input", debouncedSave);
  }
})();

// ---------- Draft Resume (beta): build + download .docx ----------
function buildDraftResume(resumeText, jdText, bullets) {
  const header = `DRAFT RESUME — Tailored to Job Description\n----------------------------------------\n`;
  const summary = `SUMMARY\n- Adapted resume aligned to JD highlights.\n\n`;
  const expHeader = `EXPERIENCE HIGHLIGHTS (AI-Suggested)\n${bullets.map(b => `• ${b}`).join("\n")}\n\n`;
  const footer = `NOTES\n- Review and edit for accuracy before sending.\n`;

  // Optionally include original resume bits or JD keywords
  const original = resumeText ? `\nORIGINAL EXCERPT\n${resumeText.slice(0, 800)}\n\n` : "";
  const jdExcerpt = jdText ? `JD EXCERPT\n${jdText.slice(0, 600)}\n\n` : "";

  return header + summary + expHeader + original + jdExcerpt + footer;
}

(function wireDraftResumeFlow(){
  const buildDraftBtn = $("buildDraftBtn");
  const downloadDraftDocxBtn = $("downloadDraftDocxBtn");

  if (buildDraftBtn) {
    buildDraftBtn.addEventListener("click", () => {
      const resumeEl = $("resume");
      const jdEl = $("jobDesc") || $("jd");
      const draftEl = $("draftResume");

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

  if (downloadDraftDocxBtn) {
    const handler = withLoading(downloadDraftDocxBtn, spinnerHTML("Making DOCX…"), async () => {
      const draftEl = $("draftResume");
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
        a.download = "draft_resume.docx";
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);

        showMessage("success", "Draft resume downloaded as .docx");
      } catch (err) {
        showMessage("error", friendlyError(err));
      }
    });
    downloadDraftDocxBtn.addEventListener("click", handler);
  }
})();

// ---------- Init on load ----------
(function init() {
  // Reset usage if a new day
  if (isNewDay()) resetDailyUsage();
  updateUsageCounter();

  // Counters
  wireCounters();

  // Email modal
  wireEmailModal();

  // Offer to load saved draft if present
  maybeOfferLoadDraft();
})();