// ================================
// Resume Optimizer — script.js (Prod)
// Lessons 1–17 consolidated
// ================================

// ---------- Config ----------
const BASE_REWRITES_PER_DAY = 5;
const EMAIL_BONUS_REWRITES = 5; // after email, total 10/day
const AUTOSAVE_DEBOUNCE_MS = 400;

const LS_KEYS = {
  resume: "ro.resume",
  jd: "ro.jd",
  savedAt: "ro.savedAt",
  usageDate: "ro.usageDate",
  rewritesUsed: "ro.rewritesUsed",
  hasEmail: "ro.hasEmail",
  tone: "ro.tone",
  seniority: "ro.seniority",
  role: "ro.role",
};

// ---------- Small helpers ----------
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

// ---------- Simple alert messaging ----------
function showMessage(type, text) {
  // types: info | success | warn | error
  let box = document.getElementById("messages");
  if (!box) box = document.getElementById("summary"); // last resort
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
  const m = (err?.message || err || "").toString();
  if (/rate[_\s-]?limit/i.test(m)) {
    return "We’re getting rate-limited. Please try again in ~30 seconds.";
  }
  if (/invalid_api_key|api key/i.test(m)) {
    return "Server config error (API key). Please try again later.";
  }
  if (/file/i.test(m) && /not.*found|undefined/i.test(m)) {
    return "Couldn’t read the uploaded file. Please pick a .docx, .pdf or .txt and try again.";
  }
  if (/METHOD not allowed|405/.test(m)) {
    return "That endpoint doesn’t accept this action. Please reload and try again.";
  }
  if (/FUNCTION_INVOCATION_FAILED|500|server error/i.test(m)) {
    return "Our server had a hiccup. Please try again.";
  }
  return m || "Something went wrong.";
}

// ---------- Utility: tokenizing & keyword stats ----------
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
    `Add a bullet using “${term}” with quantified impact or a specific tool/context.`
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

// --- Results element compatibility (tolerate older/newer IDs) ---
function getResultsEls() {
  return {
    topJd:
      document.getElementById("topJdList") ||
      document.getElementById("topJd"),
    missing:
      document.getElementById("missingList") ||
      document.getElementById("missing"),
    suggestions:
      document.getElementById("suggestionsList") ||
      document.getElementById("suggestions"),
    summary: document.getElementById("summary"),
  };
}

// ---------- Character counters ----------
function updateCounterFrom(el, counterEl) {
  if (!el || !counterEl) return;
  counterEl.textContent = `${(el.value || "").length} characters`;
}
function wireCounters() {
  const resumeEl = document.getElementById("resume");
  const jobDescEl =
    document.getElementById("jobDesc") || document.getElementById("jd");
  const resumeCount = document.getElementById("resumeCount");
  const jobDescCount = document.getElementById("jobDescCount");

  if (resumeEl && resumeCount) {
    updateCounterFrom(resumeEl, resumeCount);
    resumeEl.addEventListener("input", () =>
      updateCounterFrom(resumeEl, resumeCount)
    );
  }
  if (jobDescEl && jobDescCount) {
    updateCounterFrom(jobDescEl, jobDescCount);
    jobDescEl.addEventListener("input", () =>
      updateCounterFrom(jobDescEl, jobDescCount)
    );
  }
}

// ---------- Usage limits + email gate ----------
function resetUsageIfNewDay() {
  const today = new Date().toISOString().slice(0, 10);
  const savedDay = localStorage.getItem(LS_KEYS.usageDate);
  if (savedDay !== today) {
    localStorage.setItem(LS_KEYS.usageDate, today);
    localStorage.setItem(LS_KEYS.rewritesUsed, "0");
  }
}
function getRewritesUsed() {
  resetUsageIfNewDay();
  return parseInt(localStorage.getItem(LS_KEYS.rewritesUsed) || "0", 10);
}
function incrementRewrites() {
  resetUsageIfNewDay();
  const used = getRewritesUsed() + 1;
  localStorage.setItem(LS_KEYS.rewritesUsed, String(used));
  updateUsageCounter();
}
function hasEmailBonus() {
  return localStorage.getItem(LS_KEYS.hasEmail) === "true";
}
function maxPerDay() {
  return BASE_REWRITES_PER_DAY + (hasEmailBonus() ? EMAIL_BONUS_REWRITES : 0);
}
function updateUsageCounter() {
  const el = document.getElementById("usageCounter");
  if (el) {
    el.textContent = `${getRewritesUsed()} / ${maxPerDay()} rewrites used today`;
  }
}
function maybeAskEmailGate() {
  if (hasEmailBonus()) return true; // already gated
  const email = prompt(
    "Daily limit reached (5). Enter your email to unlock 5 more today:"
  );
  if (!email) return false;
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    showMessage("warn", "That doesn’t look like a valid email.");
    return false;
  }
  localStorage.setItem(LS_KEYS.hasEmail, "true");
  updateUsageCounter();
  showMessage("success", "Thanks! You now have 10 rewrites for today.");
  return true;
}

// ---------- Autosave (resume + JD + controls) ----------
function saveDraft() {
  const resumeEl = document.getElementById("resume");
  const jdEl = document.getElementById("jobDesc") || document.getElementById("jd");
  if (!resumeEl || !jdEl) return;

  localStorage.setItem(LS_KEYS.resume, resumeEl.value || "");
  localStorage.setItem(LS_KEYS.jd, jdEl.value || "");
  localStorage.setItem(LS_KEYS.savedAt, new Date().toISOString());

  // save control selections if present
  const tone = document.getElementById("tone")?.value;
  const seniority = document.getElementById("seniority")?.value;
  const role = document.getElementById("role")?.value;
  if (tone) localStorage.setItem(LS_KEYS.tone, tone);
  if (seniority) localStorage.setItem(LS_KEYS.seniority, seniority);
  if (role) localStorage.setItem(LS_KEYS.role, role);

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

  // restore controls
  const tone = localStorage.getItem(LS_KEYS.tone);
  const seniority = localStorage.getItem(LS_KEYS.seniority);
  const role = localStorage.getItem(LS_KEYS.role);
  if (tone && document.getElementById("tone")) document.getElementById("tone").value = tone;
  if (seniority && document.getElementById("seniority")) document.getElementById("seniority").value = seniority;
  if (role && document.getElementById("role")) document.getElementById("role").value = role;

  // counters
  if (typeof updateCounterFrom === "function") {
    const resumeCount = document.getElementById("resumeCount");
    const jobDescCount = document.getElementById("jobDescCount");
    if (resumeCount) updateCounterFrom(resumeEl, resumeCount);
    if (jobDescCount) updateCounterFrom(jdEl, jobDescCount);
  }

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
  localStorage.removeItem(LS_KEYS.tone);
  localStorage.removeItem(LS_KEYS.seniority);
  localStorage.removeItem(LS_KEYS.role);
}

// Load banner on arrival
(function showLoadBannerOnce() {
  try {
    const has = (localStorage.getItem(LS_KEYS.resume) || localStorage.getItem(LS_KEYS.jd) || "").length > 0;
    if (!has) return;
    const asked = sessionStorage.getItem("ro.loadAsked");
    if (asked === "true") return;

    const summary = document.getElementById("summary");
    if (!summary) return;
    const bar = document.createElement("div");
    bar.className = "alert info";
    bar.innerHTML = `
      Found a saved draft. <button id="loadDraftInline" class="secondary small">Load it</button>
      <button id="dismissDraftInline" class="secondary small">Dismiss</button>
    `;
    summary.prepend(bar);
    sessionStorage.setItem("ro.loadAsked", "true");

    bar.querySelector("#loadDraftInline")?.addEventListener("click", () => {
      loadDraft();
      bar.remove();
    });
    bar.querySelector("#dismissDraftInline")?.addEventListener("click", () => {
      bar.remove();
    });
  } catch (_) {}
})();

// ---------- Analyze Alignment (local) ----------
(function wireAnalyze() {
  const analyzeBtn = document.getElementById("analyzeBtn");
  if (!analyzeBtn) return;

  const handler = withLoading(analyzeBtn, "Analyzing…", async () => {
    const resume = (document.getElementById("resume")?.value || "").trim();
    const jobDesc =
      (document.getElementById("jobDesc")?.value ||
        document.getElementById("jd")?.value ||
        "").trim();

    const { topJd, missing, suggestions, summary } = getResultsEls();

    if (!resume || !jobDesc) {
      showMessage("warn", "Please paste both Resume and Job Description.");
      return;
    }

    try {
      if (summary) summary.innerHTML = spinnerHTML("Analyzing text…");

      const resumeCounts = keywordCounts(resume);
      const jdCounts = keywordCounts(jobDesc);
      const jdTop = topTerms(jdCounts, 20);
      const miss = missingTerms(jdTop, resumeCounts);
      const sugg = roughSuggestions(miss);

      const coverage = ((jdTop.length - miss.length) / Math.max(1, jdTop.length) * 100).toFixed(0);
      if (summary) {
        summary.innerHTML = `
          <div class="card">
            <h3>Alignment Analysis</h3>
            <p><strong>Coverage:</strong> ${coverage}% of top JD terms appear in your resume.</p>
            <p><strong>Next step:</strong> Use “Suggested Actions” to weave missing terms into impact bullets, then click “Rewrite for Alignment”.</p>
          </div>
        `;
      }

      renderList(topJd, jdTop, x => `${x.term} (${x.count})`);
      renderList(missing, miss, x => x.term);
      renderList(suggestions, sugg);

      showMessage("success", "Alignment analysis complete.");
    } catch (err) {
      if (summary) summary.innerHTML = "";
      showMessage("error", friendlyError(err));
    }
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
    throw new Error(await r.text());
  }
  const data = await r.json();
  return data.bullets || "";
}

(function wireRewrite() {
  const rewriteBtn = document.getElementById("rewriteBtn");
  if (!rewriteBtn) return;

  const handler = withLoading(rewriteBtn, "Rewriting…", async () => {
    const resume = (document.getElementById("resume")?.value || "").trim();
    const jd =
      (document.getElementById("jobDesc")?.value ||
        document.getElementById("jd")?.value ||
        "").trim();
    const { summary } = getResultsEls();
    if (!resume || !jd) {
      showMessage("warn", "Please paste both Resume and Job Description first.");
      return;
    }

    resetUsageIfNewDay();
    const used = getRewritesUsed();
    const max = maxPerDay();
    if (used >= max) {
      if (!hasEmailBonus()) {
        const ok = maybeAskEmailGate();
        if (!ok) return;
      } else {
        showMessage("warn", "Daily limit reached. Please come back tomorrow.");
        return;
      }
    }

    // Lesson 7 style controls if present
    const tone = (document.getElementById("tone")?.value || "Professional").toLowerCase();
    const seniority = (document.getElementById("seniority")?.value || "Mid").toLowerCase();
    const role = (document.getElementById("role")?.value || "General").toLowerCase();

    try {
      if (summary) summary.innerHTML = spinnerHTML("Rewriting with AI…");

      const bullets = await callRewriteAPI(resume, jd, { tone, seniority, role });
      const html = bullets
        .split("\n")
        .map(l => l.trim())
        .filter(Boolean)
        .map(l => l.replace(/^[-•*\d.)\s]+/, "")) // strip markers
        .map(l => `<li>${l}</li>`)
        .join("");

      if (summary) {
        summary.innerHTML = `<div class="card"><h3>AI Suggested Bullets</h3><ul>${html}</ul></div>`;
      }

      incrementRewrites();
      showMessage("success", `AI rewrite complete. (${getRewritesUsed()}/${maxPerDay()} used today)`);
    } catch (err) {
      if (summary) summary.innerHTML = "";
      showMessage("error", friendlyError(err));
    }
  });

  rewriteBtn.addEventListener("click", handler);
})();

// ---------- Copy + Download bullets ----------
function getCurrentBullets() {
  const { summary } = getResultsEls();
  const lis = summary ? summary.querySelectorAll("li") : [];
  return Array.from(lis).map(li => li.textContent.trim()).filter(Boolean);
}

// Copy bullets
(function wireCopy() {
  const copyBtn = document.getElementById("copyBtn");
  if (!copyBtn) return;
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
})();

// Download bullets .docx (backend)
(function wireDownloadBullets() {
  const downloadBtn = document.getElementById("downloadBtn");
  if (!downloadBtn) return;

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
        body: JSON.stringify({ title: "AI Suggested Resume Bullets", bullets }),
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
})();

// ---------- File Upload → /api/extract ----------
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
    formData.append("file", file);

    const original = uploadBtn.innerHTML;
    uploadBtn.disabled = true;
    uploadBtn.innerHTML = `<span class="spinner"></span>Uploading…`;

    try {
      showMessage("info", "Extracting text from file…");
      const r = await fetch("/api/extract", { method: "POST", body: formData });
      if (!r.ok) throw new Error(await r.text());
      const data = await r.json();

      const resumeEl = document.getElementById("resume");
      if (resumeEl) resumeEl.value = data.text || "";
      if (resumeEl) {
        const resumeCount = document.getElementById("resumeCount");
        if (resumeCount) updateCounterFrom(resumeEl, resumeCount);
      }
      // autosave after extraction
      saveDraft();

      showMessage("success", "File text extracted and added to your resume.");
    } catch (err) {
      showMessage("error", friendlyError(err));
    } finally {
      uploadBtn.disabled = false;
      uploadBtn.innerHTML = original;
      resumeFileInput.value = "";
    }
  });
})();

// ---------- Clear ----------
(function wireClear() {
  const clearBtn = document.getElementById("clearBtn");
  if (!clearBtn) return;

  clearBtn.addEventListener("click", () => {
    const ids = ["resume", "jobDesc", "jd", "summary"];
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
    showMessage("info", "Cleared. Paste your fresh text to continue.");
  });
})();

// ---------- Draft save/load buttons ----------
(function wireDraftButtons() {
  const saveBtn = document.getElementById("saveBtn");
  if (saveBtn) saveBtn.addEventListener("click", saveDraft);

  const loadBtn = document.getElementById("loadBtn");
  if (loadBtn) loadBtn.addEventListener("click", loadDraft);

  const clearDraftBtn = document.getElementById("clearDraftBtn");
  if (clearDraftBtn)
    clearDraftBtn.addEventListener("click", () => {
      clearDraft();
      showMessage("success", "Draft cleared.");
    });
})();

// ---------- Autosave (typing) ----------
(function wireAutosaveTyping() {
  const resumeEl = document.getElementById("resume");
  const jdEl = document.getElementById("jobDesc") || document.getElementById("jd");
  if (!resumeEl || !jdEl) return;
  const debouncedSave = debounce(saveDraft, AUTOSAVE_DEBOUNCE_MS);
  resumeEl.addEventListener("input", debouncedSave);
  jdEl.addEventListener("input", debouncedSave);
  // also save control changes if present
  ["tone", "seniority", "role"].forEach((id) => {
    const el = document.getElementById(id);
    if (el) el.addEventListener("change", debouncedSave);
  });
})();

// ---------- Draft Resume (beta) ----------
function buildDraftResume(resume, jd, bullets) {
  const nameLine = "Candidate Name";
  const header = `${nameLine}\nCity, ST · email@example.com · (555) 555-5555 · linkedin.com/in/yourhandle\n\n`;
  const summary = jd
    ? `PROFESSIONAL SUMMARY\n${jd.slice(0, 300)}…\n\n`
    : "PROFESSIONAL SUMMARY\nImpact-oriented professional aligning experience to role requirements.\n\n";

  const bulletLines = bullets.map((b) => `• ${b}`).join("\n");
  const exp = `EXPERIENCE\n${bulletLines}\n\n`;

  const skills = "SKILLS\n• Add 6–10 skills/keywords that appear in the JD\n";
  return header + summary + exp + skills;
}

(function wireDraftResume() {
  const buildDraftBtn = document.getElementById("buildDraftBtn");
  const downloadDraftBtn = document.getElementById("downloadDraftBtn");
  if (!buildDraftBtn && !downloadDraftBtn) return;

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
          body: JSON.stringify({ title: "Draft Resume", text }),
        });
        if (!r.ok) throw new Error(await r.text());

        // We expect a text/plain stream back as a file
        const blob = await r.blob();
        const url = URL.createObjectURL(blob);
        const a = document.createElement("a");
        a.href = url;
        a.download = "Draft_Resume.txt";
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);

        showMessage("success", "Draft downloaded.");
      } catch (err) {
        showMessage("error", friendlyError(err));
      }
    });

    downloadDraftBtn.addEventListener("click", handler);
  }
})();

// ---------- Initialize on load ----------
document.addEventListener("DOMContentLoaded", () => {
  wireCounters();
  resetUsageIfNewDay();
  updateUsageCounter();
});