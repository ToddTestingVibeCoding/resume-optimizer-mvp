// ================================
// Resume Optimizer — script.js
// Lessons 1–20 (production build)
// ================================

// ---------- Config ----------
const BASE_REWRITES_PER_DAY = 5;
const EMAIL_BONUS_REWRITES = 5; // +5 if user provides email (total 10)
const AUTOSAVE_DEBOUNCE_MS = 500;

// LocalStorage keys
const LS_KEYS = {
  resume: "ro.resume",
  jd: "ro.jd",
  savedAt: "ro.savedAt",
  rewrites: "ro.rewrites.used",
  lastDay: "ro.rewrites.day",
  email: "ro.user.email",
  export: "ro.session.export" // temp scratch key (optional)
};

// ---------- Tiny utilities ----------
function debounce(fn, wait) {
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

function showMessage(type, text) {
  // type: info | success | warn | error
  const box = document.getElementById("messages") || document.body;
  const div = document.createElement("div");
  div.className = `alert ${type}`;
  div.textContent = text;
  box.prepend(div);
  setTimeout(() => div.remove(), 5000);
}

function friendlyError(err) {
  const msg = (err && (err.message || err.detail || err.error)) ? (err.message || err.detail || err.error) : String(err || "Unknown error");
  // common platform/OpenAI-ish messages normalization
  if (/rate limit/i.test(msg)) return "The AI is rate-limited right now. Please try again in a bit.";
  if (/network|fetch/i.test(msg)) return "Network issue. Check your connection and try again.";
  if (/json/i.test(msg) && /invalid/i.test(msg)) return "Received an unexpected response. Please try again.";
  return msg;
}

// ---------- Usage gates (rewrites per day) ----------
function todayKey() {
  const d = new Date();
  return `${d.getUTCFullYear()}-${d.getUTCMonth() + 1}-${d.getUTCDate()}`;
}
function hasEmail() {
  const v = (localStorage.getItem(LS_KEYS.email) || "").trim();
  return !!v;
}
function maxPerDay() {
  return BASE_REWRITES_PER_DAY + (hasEmail() ? EMAIL_BONUS_REWRITES : 0);
}
function getRewritesUsed() {
  const day = localStorage.getItem(LS_KEYS.lastDay);
  const today = todayKey();
  if (day !== today) {
    localStorage.setItem(LS_KEYS.lastDay, today);
    localStorage.setItem(LS_KEYS.rewrites, "0");
    return 0;
  }
  return parseInt(localStorage.getItem(LS_KEYS.rewrites) || "0", 10);
}
function incrementRewrites() {
  const used = getRewritesUsed() + 1;
  localStorage.setItem(LS_KEYS.rewrites, String(used));
  updateUsageCounter();
}
function updateUsageCounter() {
  const el = document.getElementById("usageCounter");
  if (!el) return;
  el.textContent = `${getRewritesUsed()} / ${maxPerDay()} rewrites used today`;
}

// Email capture (modal if present, fallback to prompt)
function requestEmailIfNeeded() {
  if (hasEmail()) return Promise.resolve(true);

  return new Promise((resolve) => {
    const modal = document.getElementById("emailModal");
    const form = document.getElementById("emailForm");
    const input = document.getElementById("userEmail");
    const closeBtn = document.getElementById("emailClose");

    function saveEmail(val) {
      const email = (val || "").trim();
      if (!email || !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) {
        showMessage("warn", "Please enter a valid email (you can skip if you prefer).");
        return false;
      }
      localStorage.setItem(LS_KEYS.email, email);
      updateUsageCounter();
      return true;
    }

    if (modal && form && input) {
      modal.style.display = "block";
      const cleanup = () => { modal.style.display = "none"; form.removeEventListener("submit", onSubmit); if (closeBtn) closeBtn.removeEventListener("click", onClose); };
      const onClose = (e) => { e.preventDefault(); cleanup(); resolve(false); };
      const onSubmit = (e) => {
        e.preventDefault();
        if (saveEmail(input.value)) {
          showMessage("success", "Thanks! You unlocked 5 extra rewrites today.");
          cleanup();
          resolve(true);
        }
      };
      form.addEventListener("submit", onSubmit);
      if (closeBtn) closeBtn.addEventListener("click", onClose);
    } else {
      // fallback simple prompt
      const answer = prompt("Enter your email to unlock 5 extra rewrites today (or Cancel to skip):");
      if (answer && saveEmail(answer)) {
        showMessage("success", "Thanks! You unlocked 5 extra rewrites today.");
        resolve(true);
      } else {
        resolve(false);
      }
    }
  });
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

// ---------- Autosave (resume/jd) ----------
function saveDraft() {
  const resumeEl = document.getElementById("resume");
  const jdEl = document.getElementById("jobDesc") || document.getElementById("jd");
  if (!resumeEl || !jdEl) return;

  localStorage.setItem(LS_KEYS.resume, resumeEl.value || "");
  localStorage.setItem(LS_KEYS.jd, jdEl.value || "");
  const stamp = new Date().toISOString();
  localStorage.setItem(LS_KEYS.savedAt, stamp);

  // update saved badges
  setSavedStatus("resume", stamp);
  setSavedStatus("jd", stamp);
}
const debouncedSaveDraft = debounce(saveDraft, AUTOSAVE_DEBOUNCE_MS);

function loadDraft() {
  const resumeEl = document.getElementById("resume");
  const jdEl = document.getElementById("jobDesc") || document.getElementById("jd");
  if (!resumeEl || !jdEl) return;

  const resume = localStorage.getItem(LS_KEYS.resume) || "";
  const jd = localStorage.getItem(LS_KEYS.jd) || "";
  resumeEl.value = resume;
  jdEl.value = jd;

  // counters + highlight refresh
  wireCounters();
  refreshMirror();

  const when = localStorage.getItem(LS_KEYS.savedAt);
  if (resume || jd) {
    showMessage("success", when ? `Draft loaded (saved ${new Date(when).toLocaleString()}).` : "Draft loaded.");
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

// saved status helpers (Lesson 18)
function setSavedStatus(which, whenISO) {
  const el = which === "resume" ? document.getElementById("resumeSaved")
                                : document.getElementById("jdSaved");
  if (!el) return;
  if (!whenISO) { el.textContent = "Not saved"; return; }
  const dt = new Date(whenISO);
  el.textContent = `Saved at ${dt.toLocaleTimeString([], { hour: "numeric", minute: "2-digit" })}`;
}
function refreshSavedStatusFromStorage() {
  const when = localStorage.getItem(LS_KEYS.savedAt);
  setSavedStatus("resume", when);
  setSavedStatus("jd", when);
}

// ---------- JD term highlighting (mirror overlay) ----------
function getJDTerms() {
  const raw = (document.getElementById("jobDesc")?.value || document.getElementById("jd")?.value || "").toLowerCase();
  // naive term pick: split on non-letters, keep words >= 4 chars
  const words = raw.split(/[^a-z0-9+]/i).filter(w => w && w.length >= 4);
  // dedupe + take top N by frequency
  const freq = {};
  words.forEach(w => { freq[w] = (freq[w] || 0) + 1; });
  const top = Object.entries(freq).sort((a,b)=>b[1]-a[1]).slice(0, 25).map(([w])=>w);
  return top;
}

function highlightResumeText(text, terms) {
  if (!terms.length || !text) return text.replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/\n/g, "<br>");
  // build regex like \b(term1|term2|term3)\b, escape special chars
  const escaped = terms.map(t => t.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"));
  const re = new RegExp(`\\b(${escaped.join("|")})\\b`, "gi");
  const safe = text.replace(/</g, "&lt;").replace(/>/g, "&gt;");
  return safe.replace(re, '<mark class="hl">$1</mark>').replace(/\n/g, "<br>");
}

function refreshMirror() {
  const mirror = document.getElementById("resumeMirror");
  const resumeEl = document.getElementById("resume");
  const toggle = document.getElementById("highlightToggle");
  if (!mirror || !resumeEl || !toggle) return;

  if (!toggle.checked) {
    mirror.innerHTML = "";
    mirror.style.display = "none";
    resumeEl.style.background = ""; // normal
    return;
  }
  const terms = getJDTerms();
  mirror.innerHTML = highlightResumeText(resumeEl.value || "", terms);
  mirror.style.display = "block";
  // keep scroll in sync
  mirror.scrollTop = resumeEl.scrollTop;
  mirror.scrollLeft = resumeEl.scrollLeft;
}

// ---------- Results rendering helpers ----------
function setAnalysisBlocks(data) {
  // Support both consolidated #summary or split blocks
  const summary = document.getElementById("summary");

  const alignEl = document.getElementById("alignment");
  const topEl   = document.getElementById("topTerms");
  const missEl  = document.getElementById("missingTerms");
  const suggEl  = document.getElementById("suggestions");

  if (alignEl || topEl || missEl || suggEl) {
    if (alignEl) alignEl.innerHTML = `<div class="card"><h3>Alignment Analysis</h3><p>${(data.analysis || "").replace(/\n/g, "<br>")}</p></div>`;
    if (topEl)   topEl.innerHTML   = `<div class="card"><h3>Top JD Terms</h3><ul>${(data.topTerms || []).map(t=>`<li>${t}</li>`).join("")}</ul></div>`;
    if (missEl)  missEl.innerHTML  = `<div class="card"><h3>Missing Terms</h3><ul>${(data.missingTerms || []).map(t=>`<li>${t}</li>`).join("")}</ul></div>`;
    if (suggEl)  suggEl.innerHTML  = `<div class="card"><h3>Suggested Actions</h3><p>${(data.suggestions || "").replace(/\n/g, "<br>")}</p></div>`;
  } else if (summary) {
    // fallback: dump everything in summary
    summary.innerHTML = `
      <div class="card">
        <h3>Alignment Analysis</h3>
        <p>${(data.analysis || "").replace(/\n/g, "<br>")}</p>
        <h4>Top JD Terms</h4>
        <ul>${(data.topTerms || []).map(t=>`<li>${t}</li>`).join("")}</ul>
        <h4>Missing Terms</h4>
        <ul>${(data.missingTerms || []).map(t=>`<li>${t}</li>`).join("")}</ul>
        <h4>Suggested Actions</h4>
        <p>${(data.suggestions || "").replace(/\n/g, "<br>")}</p>
      </div>
    `;
  }
}

// For summary bullets → array
function getCurrentBullets() {
  const summary = document.getElementById("summary");
  const lis = summary ? summary.querySelectorAll("li") : [];
  return Array.from(lis).map(li => li.textContent.trim()).filter(Boolean);
}

// ---------- Draft builder ----------
function buildDraftResume(resume, jd, bulletsArr) {
  const bullets = Array.isArray(bulletsArr) ? bulletsArr : String(bulletsArr||"").split("\n").map(s=>s.trim()).filter(Boolean);
  const header =
`DRAFT RESUME (Auto-built)
==========================

SUMMARY
-------
Impact-focused professional tailored to the provided role.

HIGHLIGHTS
----------
${bullets.map(b => `• ${b}`).join("\n")}
`;

  const body =
`
EXPERIENCE
----------
(Replace with your own roles; integrate the best bullets above.)

EDUCATION
---------
(Your degrees, credentials.)

SKILLS
------
(Add skills aligned to the JD’s Top Terms & address Missing Terms.)
`;

  const tail =
`
NOTES
-----
This draft was generated from your pasted resume + job description to jump-start a targeted version. Edit for accuracy and truthfulness before sending.
`;
  return [header, body, tail].join("\n");
}

// ---------- On load wiring ----------
document.addEventListener("DOMContentLoaded", () => {
  // counters + usage counter + saved badges
  wireCounters();
  updateUsageCounter();
  refreshSavedStatusFromStorage();

  // If there’s a saved draft and inputs are empty, offer to load it
  (function offerLoadDraftOnce() {
    const resumeEl = document.getElementById("resume");
    const jdEl = document.getElementById("jobDesc") || document.getElementById("jd");
    const savedResume = localStorage.getItem(LS_KEYS.resume) || "";
    const savedJD = localStorage.getItem(LS_KEYS.jd) || "";
    if ((savedResume || savedJD) && resumeEl && jdEl && !(resumeEl.value || jdEl.value)) {
      // auto-load with a soft message (kept simple to avoid intrusive modals)
      loadDraft();
      showMessage("info", "Loaded your last saved draft automatically.");
    }
  })();

  // Keep autosave up to date
  const resumeEl = document.getElementById("resume");
  const jdEl = document.getElementById("jobDesc") || document.getElementById("jd");
  if (resumeEl) resumeEl.addEventListener("input", () => { debouncedSaveDraft(); refreshMirror(); });
  if (jdEl) jdEl.addEventListener("input", () => { debouncedSaveDraft(); refreshMirror(); });

  // Mirror highlight toggle + scroll sync
  const toggle = document.getElementById("highlightToggle");
  const mirror = document.getElementById("resumeMirror");
  if (toggle) toggle.addEventListener("change", refreshMirror);
  if (resumeEl && mirror) {
    resumeEl.addEventListener("scroll", () => {
      mirror.scrollTop = resumeEl.scrollTop;
      mirror.scrollLeft = resumeEl.scrollLeft;
    });
  }

  // ---------- Upload Resume File (hidden input flow) ----------
  const uploadBtn = document.getElementById("uploadBtn");
  const resumeFileInput = document.getElementById("resumeFile");
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
        debouncedSaveDraft();
        refreshMirror();
        showMessage("success", "File text extracted and added to your resume.");
      } catch (err) {
        showMessage("error", friendlyError(err));
      } finally {
        resumeFileInput.value = ""; // allow reselecting the same file
      }
    });
  }

  // ---------- Analyze Alignment ----------
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

      const summary = document.getElementById("summary");
      if (summary) summary.innerHTML = spinnerHTML("Analyzing alignment…");

      try {
        const r = await fetch("/api/analyze", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ resume, jobDesc })
        });
        if (!r.ok) throw new Error(await r.text());
        const data = await r.json();
        setAnalysisBlocks(data);
        showMessage("success", "Alignment analysis complete.");
      } catch (err) {
        if (summary) summary.innerHTML = "";
        showMessage("error", friendlyError(err));
      }
    });
    analyzeBtn.addEventListener("click", handler);
  }

  // ---------- Rewrite (AI) with limits + optional email unlock ----------
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

      // Enforce per-day limit
      const used = getRewritesUsed();
      const cap = maxPerDay();
      if (used >= cap) {
        // offer email unlock if not provided yet
        if (!hasEmail()) {
          const gave = await requestEmailIfNeeded();
          if (!gave) {
            showMessage("warn", "Daily limit reached. Try again tomorrow or provide email to unlock more.");
            return;
          }
          // re-check limits after email
          if (getRewritesUsed() >= maxPerDay()) {
            showMessage("warn", "Daily limit reached. Please try again tomorrow.");
            return;
          }
        } else {
          showMessage("warn", "Daily limit reached. Please try again tomorrow.");
          return;
        }
      }

      if (summary) summary.innerHTML = spinnerHTML("Rewriting with AI…");

      try {
        const resp = await fetch("/api/rewrite", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ resume, jd })
        });
        if (!resp.ok) throw new Error(await resp.text());
        const data = await resp.json();

        let bullets = data.bullets;
        if (Array.isArray(bullets)) {
          // ok
        } else if (typeof bullets === "string") {
          bullets = bullets.split("\n").map(s => s.trim()).filter(Boolean);
        } else {
          throw new Error("Invalid rewrite response format");
        }

        const html = bullets.map(l => l.replace(/^[-•*\d.)\s]+/, "")).map(l => `<li>${l}</li>`).join("");
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

  // ---------- Copy bullets ----------
  const copyBtn = document.getElementById("copyBtn");
  if (copyBtn) {
    copyBtn.addEventListener("click", async () => {
      const bullets = getCurrentBullets();
      if (!bullets.length) { showMessage("warn", "No AI bullets to copy yet!"); return; }
      try {
        await navigator.clipboard.writeText(bullets.join("\n"));
        showMessage("success", "Copied AI bullets to your clipboard.");
      } catch (err) { showMessage("error", "Copy failed: " + (err?.message || err)); }
    });
  }

  // ---------- Download bullets DOCX ----------
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
      } catch (err) {
        showMessage("error", friendlyError(err));
      }
    });
    downloadBtn.addEventListener("click", handler);
  }

  // ---------- Draft Resume (build + download .txt) ----------
  const buildDraftBtn = document.getElementById("buildDraftBtn");
  const downloadDraftBtn = document.getElementById("downloadDraftBtn");
  if (buildDraftBtn) {
    buildDraftBtn.addEventListener("click", () => {
      const resume = (document.getElementById("resume")?.value || "").trim();
      const jd = (document.getElementById("jobDesc")?.value || "").trim();
      const draftEl = document.getElementById("draftResume");
      const bullets = getCurrentBullets();
      if (!bullets.length) {
        showMessage("warn", "No AI bullets found. Click “Rewrite for Alignment (AI)” first.");
        return;
      }
      const draft = buildDraftResume(resume, jd, bullets);
      if (draftEl) draftEl.value = draft;
      showMessage("success", "Draft built from your AI bullets. Edit freely before downloading.");
    });
  }
  if (downloadDraftBtn) {
    const handler = withLoading(downloadDraftBtn, "Packaging…", async () => {
      const draftEl = document.getElementById("draftResume");
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
        document.body.appendChild(a); a.click(); document.body.removeChild(a);
        URL.revokeObjectURL(url);
        showMessage("success", "Downloaded draft as .txt");
      } catch (err) {
        showMessage("error", friendlyError(err));
      }
    });
    downloadDraftBtn.addEventListener("click", handler);
  }

  // ---------- Draft save/load buttons (manual) ----------
  const saveBtn = document.getElementById("saveBtn");
  if (saveBtn) saveBtn.addEventListener("click", () => { saveDraft(); showMessage("success", "Draft saved."); });

  const loadBtn = document.getElementById("loadBtn");
  if (loadBtn) loadBtn.addEventListener("click", () => loadDraft());

  const clearDraftBtn = document.getElementById("clearDraftBtn");
  if (clearDraftBtn) clearDraftBtn.addEventListener("click", () => { clearDraft(); showMessage("success", "Draft cleared."); });

  // ---------- Clear (UI reset) ----------
  const clearBtn = document.getElementById("clearBtn");
  if (clearBtn) {
    clearBtn.addEventListener("click", () => {
      ["resume", "jobDesc", "jd", "summary", "alignment", "topTerms", "missingTerms", "suggestions"].forEach(id => {
        const el = document.getElementById(id);
        if (!el) return;
        if (el.tagName === "TEXTAREA" || el.tagName === "INPUT") el.value = "";
        else el.innerHTML = "";
      });
      wireCounters();
      refreshMirror();
      showMessage("info", "Cleared. Paste your fresh text to continue.");
    });
  }

  // ---------- Export / Import Session (JSON) ----------
  const exportBtn = document.getElementById("exportBtn");
  if (exportBtn) {
    exportBtn.addEventListener("click", () => {
      const payload = {
        resume: document.getElementById("resume")?.value || "",
        jobDesc: document.getElementById("jobDesc")?.value || document.getElementById("jd")?.value || "",
        savedAt: new Date().toISOString(),
        bullets: getCurrentBullets()
      };
      const blob = new Blob([JSON.stringify(payload, null, 2)], { type: "application/json" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url; a.download = "resume_optimizer_session.json";
      document.body.appendChild(a); a.click(); document.body.removeChild(a);
      URL.revokeObjectURL(url);
      showMessage("success", "Session exported.");
    });
  }

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
        (document.getElementById("resume") || {}).value = data.resume || "";
        (document.getElementById("jobDesc") || document.getElementById("jd") || {}).value = data.jobDesc || "";
        // render bullets into #summary
        const summary = document.getElementById("summary");
        if (summary && Array.isArray(data.bullets) && data.bullets.length) {
          summary.innerHTML = `<h3>AI Suggested Bullets</h3><ul>${data.bullets.map(b=>`<li>${b}</li>`).join("")}</ul>`;
        }
        wireCounters();
        refreshMirror();
        debouncedSaveDraft();
        showMessage("success", "Session imported.");
      } catch (err) {
        showMessage("error", "Import failed: " + friendlyError(err));
      } finally {
        importFile.value = "";
      }
    });
  }
});