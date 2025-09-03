/* =========================================
   Resume Optimizer — Frontend Script
   Lessons 1–20 consolidated
   ========================================= */

// ---------- Config ----------
const BASE_REWRITES_PER_DAY = 5;
const EMAIL_BONUS_REWRITES = 5; // +5 after email (total 10)
const AUTOSAVE_DEBOUNCE_MS = 400;

// ---------- LocalStorage Keys ----------
const LS_KEYS = {
  resume: "ro.resume",
  jd: "ro.jd",
  savedAt: "ro.savedAt",
  rewritesDate: "ro.rewrites.date",
  rewritesUsed: "ro.rewrites.used",
  userEmail: "ro.user.email",
  theme: "ro.theme"
};

// ---------- Small Utils ----------
function $(id) { return document.getElementById(id); }
function spinnerHTML(text = "Working…") { return `<span class="spinner"></span>${text}`; }

function showMessage(type, text) {
  // type: info | success | warn | error
  let box = $("messages");
  if (!box) box = $("analysis") || $("summary");
  if (!box) return;
  const div = document.createElement("div");
  div.className = `alert ${type}`;
  div.textContent = text;
  box.prepend(div);
  setTimeout(() => div.remove(), 5000);
}

function friendlyError(err) {
  try {
    const msg = err?.message || String(err);
    if (/rate limit/i.test(msg)) return "Rate limit reached. Please try again shortly.";
    if (/network|fetch/i.test(msg)) return "Network issue. Check your connection and try again.";
    if (/Unauthorized|401|403/i.test(msg)) return "Auth error. Check your API key settings in Vercel.";
    return msg;
  } catch { return "Something went wrong."; }
}

function withLoading(btn, labelWhileLoading, fn) {
  return async (...args) => {
    let original = btn?.innerHTML;
    if (btn) { btn.disabled = true; btn.innerHTML = spinnerHTML(labelWhileLoading); }
    try { return await fn(...args); }
    finally { if (btn) { btn.disabled = false; btn.innerHTML = original; } }
  };
}

function debounce(fn, wait) {
  let t; return (...args) => { clearTimeout(t); t = setTimeout(() => fn(...args), wait); };
}

// ---------- Character Counters ----------
function updateCounterFrom(el, counterEl) {
  if (!el || !counterEl) return;
  counterEl.textContent = `${(el.value || "").length} characters`;
}
function wireCounters() {
  const resumeEl = $("resume");
  const jdEl = $("jobDesc") || $("jd");
  const resumeCount = $("resumeCount");
  const jdCount = $("jobDescCount");
  if (resumeEl && resumeCount) {
    updateCounterFrom(resumeEl, resumeCount);
    resumeEl.addEventListener("input", () => updateCounterFrom(resumeEl, resumeCount));
  }
  if (jdEl && jdCount) {
    updateCounterFrom(jdEl, jdCount);
    jdEl.addEventListener("input", () => updateCounterFrom(jdEl, jdCount));
  }
}

// ---------- Usage Limits ----------
function todayStr() { return new Date().toISOString().slice(0,10); }
function hasEmail() { return !!localStorage.getItem(LS_KEYS.userEmail); }
function maxPerDay() { return BASE_REWRITES_PER_DAY + (hasEmail() ? EMAIL_BONUS_REWRITES : 0); }

function getRewritesUsed() {
  const d = localStorage.getItem(LS_KEYS.rewritesDate);
  if (d !== todayStr()) return 0;
  return parseInt(localStorage.getItem(LS_KEYS.rewritesUsed) || "0", 10);
}
function incrementRewrites() {
  const d = localStorage.getItem(LS_KEYS.rewritesDate);
  if (d !== todayStr()) {
    localStorage.setItem(LS_KEYS.rewritesDate, todayStr());
    localStorage.setItem(LS_KEYS.rewritesUsed, "1");
  } else {
    const cur = getRewritesUsed();
    localStorage.setItem(LS_KEYS.rewritesUsed, String(cur + 1));
  }
}
function updateUsageCounter() {
  const el = $("usageCounter");
  if (!el) return;
  el.textContent = `${getRewritesUsed()} / ${maxPerDay()} rewrites used today`;
}

// ---------- Email Modal (unlock extra rewrites) ----------
function openEmailModal() {
  const modal = $("emailModal");
  if (!modal) return;
  modal.style.display = "block";
  const input = $("emailInput");
  if (input) input.value = "";
}
function closeEmailModal() {
  const modal = $("emailModal");
  if (!modal) return;
  modal.style.display = "none";
}

// ---------- Draft Save / Load ----------
function saveDraft() {
  const resumeEl = $("resume");
  const jdEl = $("jobDesc") || $("jd");
  if (!resumeEl || !jdEl) return;
  localStorage.setItem(LS_KEYS.resume, resumeEl.value || "");
  localStorage.setItem(LS_KEYS.jd, jdEl.value || "");
  const now = new Date().toISOString();
  localStorage.setItem(LS_KEYS.savedAt, now);
  setSavedStatus("resume", now);
  setSavedStatus("jd", now);
}

function loadDraft() {
  const resumeEl = $("resume");
  const jdEl = $("jobDesc") || $("jd");
  if (!resumeEl || !jdEl) return;

  const resume = localStorage.getItem(LS_KEYS.resume) || "";
  const jd = localStorage.getItem(LS_KEYS.jd) || "";
  resumeEl.value = resume;
  jdEl.value = jd;

  // refresh counters
  wireCounters();

  const when = localStorage.getItem(LS_KEYS.savedAt);
  if (resume || jd) {
    showMessage("success", when ? `Draft loaded (saved ${new Date(when).toLocaleString()}).` : "Draft loaded.");
  } else {
    showMessage("warn", "No saved draft found.");
  }
  refreshSavedStatusFromStorage();
}

function clearDraft() {
  localStorage.removeItem(LS_KEYS.resume);
  localStorage.removeItem(LS_KEYS.jd);
  localStorage.removeItem(LS_KEYS.savedAt);
  setSavedStatus("resume", null);
  setSavedStatus("jd", null);
}

// Saved status helpers (small “Saved at …” under fields)
function setSavedStatus(which, whenISO) {
  const el = which === "resume" ? $("resumeSaved") : $("jdSaved");
  if (!el) return;
  if (!whenISO) { el.textContent = "Not saved"; return; }
  const dt = new Date(whenISO);
  el.textContent = `Saved at ${dt.toLocaleTimeString([], {hour:'numeric', minute:'2-digit'})}`;
}
function refreshSavedStatusFromStorage() {
  const when = localStorage.getItem(LS_KEYS.savedAt);
  setSavedStatus("resume", when);
  setSavedStatus("jd", when);
}

const debouncedSaveDraft = debounce(saveDraft, AUTOSAVE_DEBOUNCE_MS);

// ---------- Build Draft Resume (from bullets) ----------
function getCurrentBullets() {
  const ul = $("aiBullets");
  if (!ul) return [];
  return Array.from(ul.querySelectorAll("li")).map(li => li.textContent.trim()).filter(Boolean);
}

function buildDraftResume(resumeText, jdText, bulletsArr) {
  const today = new Date().toLocaleDateString();
  const bullets = (bulletsArr || []).map(b => `• ${b}`).join("\n");
  return [
    "Full Resume Draft (Auto-generated)",
    `Date: ${today}`,
    "",
    "Summary",
    "———",
    "Impact-focused professional aligning experience with target role.",
    "",
    "Core Highlights",
    "———",
    bullets || "• (Run Rewrite to generate bullet suggestions first.)",
    "",
    "Experience",
    "———",
    resumeText || "(Paste your resume content here.)",
    "",
    "Target Job Description (for context)",
    "———",
    jdText || "(Paste the JD here.)"
  ].join("\n");
}

// ---------- Import / Export ----------
function exportSession() {
  const data = {
    resume: localStorage.getItem(LS_KEYS.resume) || "",
    jd: localStorage.getItem(LS_KEYS.jd) || "",
    savedAt: localStorage.getItem(LS_KEYS.savedAt) || "",
    rewritesDate: localStorage.getItem(LS_KEYS.rewritesDate) || "",
    rewritesUsed: localStorage.getItem(LS_KEYS.rewritesUsed) || "0",
    userEmail: localStorage.getItem(LS_KEYS.userEmail) || ""
  };
  const blob = new Blob([JSON.stringify(data, null, 2)], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url; a.download = "resume-optimizer-session.json";
  document.body.appendChild(a); a.click(); a.remove();
  URL.revokeObjectURL(url);
}

async function importSession(file) {
  const text = await file.text();
  let data; try { data = JSON.parse(text); } catch { throw new Error("Invalid JSON file."); }
  if (typeof data.resume === "string") localStorage.setItem(LS_KEYS.resume, data.resume);
  if (typeof data.jd === "string") localStorage.setItem(LS_KEYS.jd, data.jd);
  if (typeof data.savedAt === "string") localStorage.setItem(LS_KEYS.savedAt, data.savedAt);
  if (typeof data.rewritesDate === "string") localStorage.setItem(LS_KEYS.rewritesDate, data.rewritesDate);
  if (typeof data.rewritesUsed === "string") localStorage.setItem(LS_KEYS.rewritesUsed, data.rewritesUsed);
  if (typeof data.userEmail === "string") localStorage.setItem(LS_KEYS.userEmail, data.userEmail);

  // reflect into UI
  const resumeEl = $("resume");
  const jdEl = $("jobDesc") || $("jd");
  if (resumeEl) resumeEl.value = localStorage.getItem(LS_KEYS.resume) || "";
  if (jdEl) jdEl.value = localStorage.getItem(LS_KEYS.jd) || "";
  wireCounters();
  refreshSavedStatusFromStorage();
  updateUsageCounter();
}

// ---------- Optional: highlight JD terms in resume ----------
function normalizeTokens(s) {
  return (s || "")
    .toLowerCase()
    .replace(/[^\w\s-]/g, " ")
    .split(/\s+/)
    .filter(Boolean);
}
function computeTopTerms(jdText, count = 15) {
  const stop = new Set(["the","and","or","of","to","a","in","for","on","with","is","be","as","by","an","are","this","that","from","at","it","you","your","we","our"]);
  const tokens = normalizeTokens(jdText).filter(t => !stop.has(t) && t.length > 2);
  const freq = new Map();
  tokens.forEach(t => freq.set(t, (freq.get(t)||0) + 1));
  return [...freq.entries()].sort((a,b)=>b[1]-a[1]).slice(0,count).map(([t])=>t);
}
function renderResumeMirror() {
  const mirror = $("resumeMirror");
  const resumeEl = $("resume");
  const jdEl = $("jobDesc") || $("jd");
  const toggle = $("highlightToggle");
  if (!mirror || !resumeEl || !jdEl || !toggle) return;

  if (!toggle.checked) { mirror.innerHTML = ""; mirror.style.display = "none"; resumeEl.style.background=""; return; }

  const terms = computeTopTerms(jdEl.value);
  let text = (resumeEl.value || "");
  // Highlight by wrapping matches (simple word boundary-ish)
  const escaped = terms.map(t => t.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"));
  const re = new RegExp(`\\b(${escaped.join("|")})\\b`, "gi");
  const html = text.replace(/&/g,"&amp;").replace(/</g,"&lt;").replace(/>/g,"&gt;")
                   .replace(re, '<mark>$1</mark>').replace(/\n/g,"<br>");
  mirror.innerHTML = html;
  mirror.style.display = "block";
  // keep background neutral so highlight is visible
  resumeEl.style.background = "transparent";
}

// ---------- DOM Wiring ----------
document.addEventListener("DOMContentLoaded", () => {
  updateUsageCounter();
  wireCounters();
  refreshSavedStatusFromStorage();

  // Autosave on input
  const resumeEl = $("resume");
  const jdEl = $("jobDesc") || $("jd");
  if (resumeEl) resumeEl.addEventListener("input", () => { debouncedSaveDraft(); renderResumeMirror(); });
  if (jdEl) jdEl.addEventListener("input", () => { debouncedSaveDraft(); renderResumeMirror(); });

  // Offer to load draft if none currently in fields
  if ((resumeEl && !resumeEl.value) && (jdEl && !jdEl.value)) {
    const savedResume = localStorage.getItem(LS_KEYS.resume) || "";
    const savedJd = localStorage.getItem(LS_KEYS.jd) || "";
    if (savedResume || savedJd) {
      const bar = document.createElement("div");
      bar.className = "alert info";
      bar.innerHTML = `
        You have a saved draft. 
        <button id="loadDraftBanner" class="ghost small">Load Draft</button>
        <button id="dismissDraftBanner" class="ghost small">Dismiss</button>
      `;
      const messages = $("messages") || document.body;
      messages.prepend(bar);

      $("loadDraftBanner")?.addEventListener("click", () => { loadDraft(); bar.remove(); });
      $("dismissDraftBanner")?.addEventListener("click", () => bar.remove());
    }
  }

  // ----- Upload Resume File (hidden input flow) -----
  const uploadBtn = $("uploadBtn");
  const resumeFileInput = $("resumeFile");
  if (uploadBtn && resumeFileInput) {
    uploadBtn.addEventListener("click", () => resumeFileInput.click());
    resumeFileInput.addEventListener("change", async () => {
      const file = resumeFileInput.files?.[0];
      if (!file) { showMessage("warn", "No file selected."); return; }

      const formData = new FormData();
      formData.append("file", file); // key must be "file"

      try {
        showMessage("info", "Extracting text from file…");
        const r = await fetch("/api/extract", { method: "POST", body: formData });
        if (!r.ok) throw new Error(await r.text());
        const data = await r.json();
        if (resumeEl) resumeEl.value = data.text || "";
        wireCounters();
        debouncedSaveDraft(); // autosave the extracted draft
        renderResumeMirror();
        showMessage("success", "File text extracted and added to your resume.");
      } catch (err) {
        showMessage("error", friendlyError(err));
      } finally {
        resumeFileInput.value = ""; // allow reselecting the same file
      }
    });
  }

  // ----- Analyze Alignment → #analysis (+ Top JD / Missing / Suggestions) -----
(function wireAnalyze() {
  // lightweight helper (uses your existing $ if present)
  const $ = window.$ || ((id) => document.getElementById(id));

  const analyzeBtn = $("analyzeBtn");
  if (!analyzeBtn) return;

  const handler = withLoading(analyzeBtn, "Analyzing…", async () => {
    // read current inputs safely
    const resume  = ($("#resume")?.value || "").trim();
    const jobDesc = ($("#jobDesc")?.value || $("#jd")?.value || "").trim();

    if (!resume || !jobDesc) {
      showMessage("warn", "Please paste both Resume and Job Description.");
      return;
    }

    const analysisBox = $("analysis");
    if (analysisBox) analysisBox.innerHTML = spinnerHTML("Analyzing alignment…");

    try {
      const r = await fetch("/api/analyze", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ resume, jobDesc })
      });
      if (!r.ok) throw new Error(await r.text());
      const data = await r.json();

      // main analysis body (string)
      const analysisText = (data.analysis ?? "").toString();
      if (analysisBox) {
        analysisBox.innerHTML = analysisText
          ? `<p>${analysisText.replace(/\n/g, "<br>")}</p>`
          : `<p>No analysis returned.</p>`;
      }

      // helper: render arrays OR newline-strings into <ul>
      const renderList = (ulId, value) => {
        const ul = $(ulId);
        if (!ul) return;
        const items = Array.isArray(value)
          ? value
          : typeof value === "string"
            ? value.split(/\r?\n/).map(s => s.trim())
            : [];
        ul.innerHTML =
          items.filter(Boolean).map(s => `<li>${s}</li>`).join("") || "<li>—</li>";
      };

      renderList("topJd",       data.topTerms);
      renderList("missing",     data.missingTerms);
      renderList("suggestions", data.suggestions);

      showMessage("success", "Alignment analysis complete.");
    } catch (err) {
      if (analysisBox) analysisBox.innerHTML = "";
      showMessage("error", friendlyError(err));
    }
  });

  analyzeBtn.addEventListener("click", handler);
})();

  // ----- Rewrite (AI) → #aiBullets with limit -----
  {
    const rewriteBtn = $("rewriteBtn");
    if (rewriteBtn) {
      const handler = withLoading(rewriteBtn, "Rewriting…", async () => {
        const resume = (resumeEl?.value || "").trim();
        const jd = (jdEl?.value || "").trim();
        if (!resume || !jd) { showMessage("warn", "Please paste both Resume and Job Description first."); return; }

        // limit
        const used = getRewritesUsed();
        if (used >= maxPerDay()) {
          if (!hasEmail()) {
            openEmailModal();
            showMessage("warn", "Daily limit reached. Enter your email to unlock 5 more today.");
          } else {
            showMessage("warn", "Daily limit reached. Try again tomorrow.");
          }
          return;
        }

        const bulletsUl = $("aiBullets");
        if (bulletsUl) bulletsUl.innerHTML = `<li>${spinnerHTML("Rewriting with AI…")}</li>`;

        try {
          const resp = await fetch("/api/rewrite", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ resume, jd })
          });
          if (!resp.ok) throw new Error(await resp.text());
          const data = await resp.json();

          let bullets = Array.isArray(data?.bullets)
            ? data.bullets
            : typeof data?.bullets === "string"
              ? data.bullets.split("\n")
              : [];

          bullets = bullets
            .map(l => l.replace(/^[-•*\d.)\s]+/, "").trim())
            .filter(Boolean);

          if (!bullets.length) {
            if (bulletsUl) bulletsUl.innerHTML = `<li>No bullets returned.</li>`;
          } else {
            if (bulletsUl) bulletsUl.innerHTML = bullets.map(l => `<li>${l}</li>`).join("");
          }

          incrementRewrites();
          updateUsageCounter();
          showMessage("success", `AI rewrite complete. (${getRewritesUsed()}/${maxPerDay()} used today)`);
        } catch (err) {
          if (bulletsUl) bulletsUl.innerHTML = "";
          showMessage("error", friendlyError(err));
        }
      });
      rewriteBtn.addEventListener("click", handler);
    }
  }

  // ----- Copy AI bullets -----
  {
    const copyBtn = $("copyBtn");
    if (copyBtn) {
      copyBtn.addEventListener("click", async () => {
        const bullets = getCurrentBullets();
        if (!bullets.length) { showMessage("warn", "No AI bullets to copy yet!"); return; }
        try {
          await navigator.clipboard.writeText(bullets.join("\n"));
          showMessage("success", "Copied AI bullets to your clipboard.");
        } catch (err) {
          showMessage("error", "Copy failed: " + friendlyError(err));
        }
      });
    }
  }

  // ----- Download AI bullets (DOCX) via backend -----
  {
    const downloadBtn = $("downloadBtn");
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
          document.body.appendChild(a); a.click(); a.remove();
          URL.revokeObjectURL(url);
          showMessage("success", "Downloaded DOCX. Open it in Word/Pages.");
        } catch (err) {
          showMessage("error", friendlyError(err));
        }
      });
      downloadBtn.addEventListener("click", handler);
    }
  }

  // ----- Build + Download Draft Resume (.docx as .txt via /api/download-text or your DOCX endpoint) -----
  {
    const buildDraftBtn = $("buildDraftBtn");
    const downloadDraftBtn = $("downloadDraftBtn");

    if (buildDraftBtn) {
      buildDraftBtn.addEventListener("click", () => {
        const draftEl = $("draftResume");
        const resume = (resumeEl?.value || "").trim();
        const jd = (jdEl?.value || "").trim();
        const bullets = getCurrentBullets();
        if (!bullets.length) { showMessage("warn", "No AI bullets found. Click “Rewrite for Alignment (AI)” first."); return; }
        const draft = buildDraftResume(resume, jd, bullets);
        if (draftEl) { draftEl.value = draft; showMessage("success", "Draft built from your AI bullets. Edit freely before downloading."); }
      });
    }

    if (downloadDraftBtn) {
      const handler = withLoading(downloadDraftBtn, "Preparing file…", async () => {
        const draftEl = $("draftResume");
        const text = (draftEl?.value || "").trim();
        if (!text) { showMessage("warn", "No draft content to download yet. Click “Build Draft from Bullets” first."); return; }
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
          a.href = url; a.download = "draft_resume.txt";
          document.body.appendChild(a); a.click(); a.remove();
          URL.revokeObjectURL(url);
          showMessage("success", "Draft downloaded.");
        } catch (err) {
          showMessage("error", friendlyError(err));
        }
      });
      downloadDraftBtn.addEventListener("click", handler);
    }
  }

  // ----- Clear -----
  {
    const clearBtn = $("clearBtn");
    if (clearBtn) {
      clearBtn.addEventListener("click", () => {
        ["resume","jobDesc","jd"].forEach(id => { const el = $(id); if (el && (el.tagName==="TEXTAREA"||el.tagName==="INPUT")) el.value = ""; });
        ["analysis","topJd","missing","suggestions","aiBullets"].forEach(id => { const c = $(id); if (c) c.innerHTML = ""; });
        const resumeCount = $("resumeCount"); if (resumeCount) resumeCount.textContent = "0 characters";
        const jdCount = $("jobDescCount"); if (jdCount) jdCount.textContent = "0 characters";
        clearDraft();
        showMessage("info", "Cleared. Paste your fresh text to continue.");
      });
    }
  }

  // ----- Save / Load / Clear Draft (buttons) -----
  {
    $("saveBtn")?.addEventListener("click", () => { saveDraft(); showMessage("success", "Draft saved."); });
    $("loadBtn")?.addEventListener("click", () => loadDraft());
    $("clearDraftBtn")?.addEventListener("click", () => { clearDraft(); showMessage("success", "Draft cleared."); });
  }

  // ----- Import / Export -----
  {
    $("exportBtn")?.addEventListener("click", exportSession);
    $("importBtn")?.addEventListener("click", () => $("importFile")?.click());
    $("importFile")?.addEventListener("change", async (e) => {
      const file = e.target.files?.[0]; if (!file) return;
      try { await importSession(file); showMessage("success", "Session imported."); }
      catch (err) { showMessage("error", friendlyError(err)); }
      finally { e.target.value = ""; }
    });
  }

  // ----- Email Modal Wiring -----
  {
    $("emailSubmit")?.addEventListener("click", () => {
      const email = ($("emailInput")?.value || "").trim();
      if (!email || !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) {
        showMessage("warn", "Please enter a valid email.");
        return;
      }
      localStorage.setItem(LS_KEYS.userEmail, email);
      updateUsageCounter();
      closeEmailModal();
      showMessage("success", "Thanks! You’ve unlocked 5 more rewrites for today.");
    });
    $("emailCancel")?.addEventListener("click", closeEmailModal);
  }

  // ----- Highlight toggle wiring -----
  {
    const toggle = $("highlightToggle");
    if (toggle) {
      toggle.addEventListener("change", renderResumeMirror);
      // initial render (off by default)
      renderResumeMirror();
    }
  }
});