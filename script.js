// ================================
// Resume Optimizer — script.js
// Production build (Lessons 6–15)
// ================================

// ---------- Config ----------
const BASE_REWRITES_PER_DAY = 5;
const EMAIL_BONUS_REWRITES = 5;      // total 10/day after email
const AUTOSAVE_DEBOUNCE_MS = 400;

// ---------- LocalStorage Keys ----------
const LS_KEYS = {
  resume:   "ro.resume",
  jd:       "ro.jd",
  savedAt:  "ro.savedAt",
  rewrites: "ro.rewritesUsed",
  email:    "ro.email"               // presence unlocks bonus
};

// ---------- Small helpers ----------
const $ = (id) => document.getElementById(id);
const on = (el, ev, fn) => el && el.addEventListener(ev, fn);

function debounce(fn, delay) {
  let t;
  return (...args) => {
    clearTimeout(t);
    t = setTimeout(() => fn(...args), delay);
  };
}

function cls(el, className, add = true) {
  if (!el) return;
  el.classList[add ? "add" : "remove"](className);
}

// ---------- Simple alert messaging ----------
function showMessage(type, text) {
  // types: info | success | warn | error
  let box = $("messages");
  if (!box) box = $("summary");
  if (!box) return;

  const div = document.createElement("div");
  div.className = `alert ${type}`;
  div.textContent = text;
  box.prepend(div);

  setTimeout(() => {
    if (div && div.parentNode) div.parentNode.removeChild(div);
  }, 5000);
}

// Human-friendly error mapper
function friendlyError(err) {
  try {
    const msg = String(err?.message || err || "");
    if (/rate limit/i.test(msg)) {
      return "You’ve hit a temporary rate limit. Please try again in ~30 seconds.";
    }
    if (/invalid_api_key|api key/i.test(msg)) {
      return "Server is missing a valid AI key. Ask the owner to set OPENAI_API_KEY in Vercel.";
    }
    if (/NetworkError|Failed to fetch/i.test(msg)) {
      return "Network issue. Check your connection and try again.";
    }
    if (/No file uploaded/i.test(msg)) {
      return "No file received. Pick a .docx, .pdf or .txt using the Upload button.";
    }
    return msg || "Something went wrong.";
  } catch {
    return "Something went wrong.";
  }
}

// ---------- Spinner + loading wrapper ----------
function spinnerHTML(text = "Working…") {
  return `<span class="spinner" aria-hidden="true"></span>${text}`;
}

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
    on(resumeEl, "input", () => updateCounterFrom(resumeEl, resumeCount));
  }
  if (jobDescEl && jobDescCount) {
    updateCounterFrom(jobDescEl, jobDescCount);
    on(jobDescEl, "input", () => updateCounterFrom(jobDescEl, jobDescCount));
  }
}

// ---------- Usage limits (daily) ----------
function getRewritesUsed() {
  return parseInt(localStorage.getItem(LS_KEYS.rewrites) || "0", 10);
}
function setRewritesUsed(n) {
  localStorage.setItem(LS_KEYS.rewrites, String(n));
}
function incrementRewrites() {
  setRewritesUsed(getRewritesUsed() + 1);
  updateUsageCounter();
}
function getDailyLimit() {
  const hasEmail = !!localStorage.getItem(LS_KEYS.email);
  return BASE_REWRITES_PER_DAY + (hasEmail ? EMAIL_BONUS_REWRITES : 0);
}
function updateUsageCounter() {
  const el = $("usageCounter");
  if (el) el.textContent = `${getRewritesUsed()} / ${getDailyLimit()} rewrites used today`;
}
function resetUsageIfNewDay() {
  // cheap “per day” reset keyed to date string
  const k = "ro.usageDate";
  const today = new Date().toDateString();
  const last = localStorage.getItem(k);
  if (last !== today) {
    localStorage.setItem(k, today);
    setRewritesUsed(0);
  }
}

// ---------- Email unlock (soft gate) ----------
function openEmailModal() {
  const modal = $("emailModal");
  if (modal) cls(modal, "open", true);
  else {
    // graceful fallback: prompt
    const email = window.prompt("Enter your email to unlock more daily rewrites:");
    if (email && /\S+@\S+\.\S+/.test(email)) {
      localStorage.setItem(LS_KEYS.email, email.trim());
      showMessage("success", "Thanks! Daily limit increased.");
      updateUsageCounter();
    }
  }
}
function closeEmailModal() {
  const modal = $("emailModal");
  if (modal) cls(modal, "open", false);
}
function wireEmailModal() {
  const form = $("emailForm");
  const input = $("emailInput");
  const closeBtn = $("emailClose");

  on(closeBtn, "click", (e) => { e.preventDefault(); closeEmailModal(); });

  on(form, "submit", (e) => {
    e.preventDefault();
    const val = (input?.value || "").trim();
    if (!val || !/\S+@\S+\.\S+/.test(val)) {
      showMessage("warn", "Please enter a valid email.");
      return;
    }
    localStorage.setItem(LS_KEYS.email, val);
    closeEmailModal();
    updateUsageCounter();
    showMessage("success", "Email saved. You now have extra daily rewrites!");
  });
}

// ---------- Draft save/load/clear ----------
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

  // refresh counters
  const rc = $("resumeCount");
  const jc = $("jobDescCount");
  if (rc) updateCounterFrom(resumeEl, rc);
  if (jc) updateCounterFrom(jdEl, jc);

  const when = localStorage.getItem(LS_KEYS.savedAt);
  if (resume || jd) {
    showMessage("info", when ? `Draft loaded (saved ${new Date(when).toLocaleString()}).` : "Draft loaded.");
  } else {
    showMessage("warn", "No saved draft found.");
  }
}
function clearDraftOnly() {
  localStorage.removeItem(LS_KEYS.resume);
  localStorage.removeItem(LS_KEYS.jd);
  localStorage.removeItem(LS_KEYS.savedAt);
}

// ---------- Tokenizing / keyword stats ----------
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
    .sort((a,b) => b[1]-a[1])
    .slice(0, limit)
    .map(([term,count]) => ({ term, count }));
}
function missingTerms(jdTop, resumeCounts) {
  const missing = [];
  for (const {term, count} of jdTop) {
    if (!resumeCounts.has(term)) missing.push({ term, jdCount: count });
  }
  return missing;
}
function roughSuggestions(missing) {
  return missing.slice(0, 10).map(({term}) =>
    `Add a bullet using “${term}” in context (quantify impact, tool, scope).`
  );
}
function renderList(el, items, formatter = (x)=>x) {
  if (!el) return;
  el.innerHTML = "";
  for (const item of items) {
    const li = document.createElement("li");
    li.textContent = formatter(item);
    el.appendChild(li);
  }
}

// ---------- Frontend ↔ API calls ----------
async function callAnalyzeAPI(resume, jobDesc) {
  const r = await fetch("/api/analyze", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ resume, jobDesc })
  });
  if (!r.ok) throw new Error(await r.text());
  return r.json(); // { analysis: "..." }
}

async function callRewriteAPI(resume, jd, options = {}) {
  const r = await fetch("/api/rewrite", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ resume, jd, options })
  });
  if (!r.ok) throw new Error(await r.text());
  return r.json(); // { bullets: "..." }
}

// ---------- Copy / Download helpers ----------
function getCurrentBullets() {
  const summary = $("summary");
  const lis = summary ? summary.querySelectorAll("li") : [];
  return Array.from(lis).map(li => li.textContent.trim()).filter(Boolean);
}

// ---------- Wire up UI once DOM ready ----------
document.addEventListener("DOMContentLoaded", () => {
  resetUsageIfNewDay();
  updateUsageCounter();
  wireCounters();
  wireEmailModal();

  // Elements
  const resumeEl  = $("resume");
  const jdEl      = $("jobDesc") || $("jd");

  // ----- Upload resume (hidden input + button) -----
  const uploadBtn = $("uploadBtn");
  const resumeFileInput = $("resumeFile");

  on(uploadBtn, "click", () => resumeFileInput && resumeFileInput.click());

  on(resumeFileInput, "change", async () => {
    const file = resumeFileInput?.files?.[0];
    if (!file) {
      showMessage("warn", "No file selected.");
      return;
    }
    try {
      const formData = new FormData();
      // Must be "file" — backend expects this name first.
      formData.append("file", file);
      showMessage("info", "Extracting text from file…");

      const r = await fetch("/api/extract", { method: "POST", body: formData });
      if (!r.ok) throw new Error(await r.text());
      const data = await r.json();

      if (resumeEl) resumeEl.value = data.text || "";
      const rc = $("resumeCount");
      if (rc) updateCounterFrom(resumeEl, rc);

      showMessage("success", "File text extracted and added to your resume.");
    } catch (err) {
      showMessage("error", friendlyError(err));
    } finally {
      if (resumeFileInput) resumeFileInput.value = "";
    }
  });

  // ----- Analyze Alignment (API + local keyword lists) -----
  const analyzeBtn = $("analyzeBtn");
  if (analyzeBtn) {
    const handler = withLoading(analyzeBtn, "Analyzing…", async () => {
      const resume = (resumeEl?.value || "").trim();
      const jobDesc = (jdEl?.value || "").trim();
      if (!resume || !jobDesc) {
        showMessage("warn", "Please paste both Resume and Job Description.");
        return;
      }
      try {
        // 1) Narrative from backend
        const data = await callAnalyzeAPI(resume, jobDesc);

        // 2) Render analysis
        const summary = $("summary");
        if (summary) {
          summary.innerHTML = `
            <div class="card">
              <h3>Alignment Analysis</h3>
              <p>${(data.analysis || "").replace(/\n/g, "<br>")}</p>
            </div>
          `;
        }

        // 3) Local keyword side-panels
        const resumeCounts = keywordCounts(resume);
        const jdCounts = keywordCounts(jobDesc);
        const jdTop = topTerms(jdCounts, 20);
        const miss = missingTerms(jdTop, resumeCounts);
        const sugg = roughSuggestions(miss);

        renderList($("topJd"), jdTop, x => `${x.term} (${x.count})`);
        renderList($("missing"), miss, x => x.term);
        renderList($("suggestions"), sugg);

        showMessage("success", "Alignment analysis complete.");
      } catch (err) {
        showMessage("error", friendlyError(err));
      }
    });
    on(analyzeBtn, "click", handler);
  }

  // ----- Clear all content -----
  const clearBtn = $("clearBtn");
  if (clearBtn) {
    on(clearBtn, "click", () => {
      const ids = ["resume", "jobDesc", "jd", "summary", "topJd", "missing", "suggestions"];
      for (const id of ids) {
        const el = $(id);
        if (!el) continue;
        if (el.tagName === "TEXTAREA" || el.tagName === "INPUT") el.value = "";
        else el.innerHTML = "";
      }
      // counters
      const rc = $("resumeCount"); if (rc) rc.textContent = "0 characters";
      const jc = $("jobDescCount"); if (jc) jc.textContent = "0 characters";

      // clear draft content, not usage/email
      clearDraftOnly();
      showMessage("info", "Cleared. Paste fresh text to continue.");
    });
  }

  // ----- Rewrite with AI (usage limits + controls) -----
  const rewriteBtn = $("rewriteBtn");
  if (rewriteBtn) {
    const handler = withLoading(rewriteBtn, "Rewriting…", async () => {
      const resume = (resumeEl?.value || "").trim();
      const jd = (jdEl?.value || "").trim();
      if (!resume || !jd) {
        showMessage("warn", "Please paste both Resume and Job Description.");
        return;
      }

      // limits
      const used = getRewritesUsed();
      const limit = getDailyLimit();
      if (used >= limit) {
        showMessage("warn", "Daily limit reached. Enter your email to unlock more.");
        openEmailModal();
        return;
      }

      // Lesson 7 controls (optional)
      const tone = ($("tone")?.value || "Professional").toLowerCase();
      const seniority = ($("seniority")?.value || "Mid").toLowerCase();
      const role = ($("role")?.value || "General").toLowerCase();

      const summary = $("summary");
      if (summary) summary.innerHTML = `<div class="card">${spinnerHTML("Rewriting with AI…")}</div>`;

      try {
        const { bullets = "" } = await callRewriteAPI(resume, jd, { tone, seniority, role });

        const html = bullets
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
        showMessage("success", `AI rewrite complete. (${getRewritesUsed()}/${getDailyLimit()} used today)`);
      } catch (err) {
        if (summary) summary.innerHTML = "";
        showMessage("error", friendlyError(err));
      }
    });

    on(rewriteBtn, "click", handler);
  }

  // ----- Save / Load / Clear draft buttons -----
  on($("saveBtn"), "click", saveDraft);
  on($("loadBtn"), "click", loadDraft);
  on($("clearDraftBtn"), "click", () => {
    clearDraftOnly();
    showMessage("success", "Draft cleared.");
  });

  // ----- Autosave (resume + jobDesc) -----
  if (resumeEl && jdEl) {
    const debouncedSave = debounce(saveDraft, AUTOSAVE_DEBOUNCE_MS);
    on(resumeEl, "input", debouncedSave);
    on(jdEl, "input", debouncedSave);
  }

  // ----- Copy bullets -----
  const copyBtn = $("copyBtn");
  if (copyBtn) {
    const handler = withLoading(copyBtn, "Copying…", async () => {
      const bullets = getCurrentBullets();
      if (!bullets.length) {
        showMessage("warn", "No AI bullets to copy yet!");
        return;
      }
      try {
        await navigator.clipboard.writeText(bullets.join("\n"));
        showMessage("success", "Copied AI bullets to clipboard.");
      } catch (err) {
        showMessage("error", "Copy failed: " + friendlyError(err));
      }
    });
    on(copyBtn, "click", handler);
  }

  // ----- Download DOCX via backend -----
  const downloadBtn = $("downloadBtn");
  if (downloadBtn) {
    const handler = withLoading(downloadBtn, "Preparing…", async () => {
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
    on(downloadBtn, "click", handler);
  }

  // ----- Suggest loading saved draft once (polite banner) -----
  try {
    const hasSavedResume = !!localStorage.getItem(LS_KEYS.resume);
    const hasSavedJd = !!localStorage.getItem(LS_KEYS.jd);
    const bannerShownKey = "ro.bannerShown";
    const alreadyShown = localStorage.getItem(bannerShownKey);

    if ((hasSavedResume || hasSavedJd) && !alreadyShown) {
      const banner = document.createElement("div");
      banner.className = "alert info";
      banner.innerHTML = `
        Looks like you have a saved draft.
        <button id="loadDraftNow" class="secondary" style="margin-left:10px;">Load now</button>
        <button id="dismissDraftBanner" class="secondary" style="margin-left:6px;">Dismiss</button>
      `;
      const mount = $("messages") || document.body;
      mount.prepend(banner);

      on($("loadDraftNow"), "click", () => {
        loadDraft();
        localStorage.setItem(bannerShownKey, "1");
        banner.remove();
      });
      on($("dismissDraftBanner"), "click", () => {
        localStorage.setItem(bannerShownKey, "1");
        banner.remove();
      });
    }
  } catch { /* no-op */ }

  // final counter render
  updateUsageCounter();
});