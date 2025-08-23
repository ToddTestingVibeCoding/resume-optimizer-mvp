// ================================
// Resume Optimizer - script.js
// Complete version (Lessons 1–7)
// ================================

// ---------- Keyword analysis (no AI) ----------
const STOPWORDS = new Set([
  "the","and","or","to","a","of","in","for","on","with","is","are","as","at","by",
  "an","be","this","that","from","it","you","your","we","our","their","they",
  "will","can","ability","responsible","responsibilities","experience","years"
]);

/* Commit: feat: add daily rewrite usage tracking with localStorage */

const MAX_REWRITES_PER_DAY = 5;

function getTodayKey() {
  const d = new Date();
  return `rewrites_${d.getFullYear()}_${d.getMonth()+1}_${d.getDate()}`;
}

function getRewritesUsed() {
  return parseInt(localStorage.getItem(getTodayKey()) || "0", 10);
}

function incrementRewrites() {
  const key = getTodayKey();
  const current = getRewritesUsed();
  localStorage.setItem(key, current + 1);
  return current + 1;
}

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
    if (!resumeCounts.has(term)) {
      missing.push({ term, jdCount: count });
    }
  }
  return missing;
}

function roughSuggestions(missing) {
  return missing.slice(0, 10).map(({term}) =>
    `Add a bullet using “${term}” in context (e.g., quantified impact or tool usage).`
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

// ---------- Messaging helpers ----------
function clearMessages() {
  const box = document.getElementById("messages");
  if (box) box.innerHTML = "";
}
function showMessage(type, text) {
  const box = document.getElementById("messages");
  if (!box) return;
  const div = document.createElement("div");
  div.className = `alert ${type}`;
  div.textContent = text;
  box.appendChild(div);
}

// ---------- Loading helpers ----------
function withLoading(btn, labelWhileLoading, fn) {
  return async function(...args) {
    let original;
    if (btn) {
      btn.disabled = true;
      original = btn.textContent;
      btn.textContent = labelWhileLoading;
    }
    try {
      return await fn(...args);
    } finally {
      if (btn) {
        btn.disabled = false;
        btn.textContent = original;
      }
    }
  };
}
function spinnerHTML(text = "Working…") {
  return `<span class="spinner"></span>${text}`;
}

/* Commit: feat: add updateUsageCounter helper and initialize value */
function updateUsageCounter() {
  const el = document.getElementById("usageCounter");
  if (el) {
    el.textContent = `${getRewritesUsed()} / ${MAX_REWRITES_PER_DAY} rewrites used today`;
  }
}
// Initialize on page load
updateUsageCounter();

// ---------- Persistence (localStorage) ----------
(function setupPersistence() {
  const resumeEl = document.getElementById("resume");
  const jdEl = document.getElementById("jd");

  // Restore saved text
  try {
    const savedResume = localStorage.getItem("resume_text");
    const savedJD = localStorage.getItem("jd_text");
    if (savedResume && resumeEl) resumeEl.value = savedResume;
    if (savedJD && jdEl) jdEl.value = savedJD;
  } catch {}

  // Save on input
  const save = () => {
    try {
      if (resumeEl) localStorage.setItem("resume_text", resumeEl.value || "");
      if (jdEl) localStorage.setItem("jd_text", jdEl.value || "");
    } catch {}
  };
  if (resumeEl) resumeEl.addEventListener("input", save);
  if (jdEl) jdEl.addEventListener("input", save);
})();

// ---------- Analyze Alignment ----------
const analyzeBtn = document.getElementById("analyzeBtn");
const clearBtn = document.getElementById("clearBtn");

if (analyzeBtn) {
  analyzeBtn.addEventListener("click", () => {
    clearMessages();

    const resume = document.getElementById("resume").value;
    const jd = document.getElementById("jd").value;

    if (!resume.trim() || !jd.trim()) {
      showMessage("warn", "Please paste both your resume and the job description to analyze.");
      return;
    }

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
        <p><strong>Next step:</strong> Use “Suggested Additions” to weave missing terms into impact bullets.</p>
      `;
    }
    renderList(topJdEl, jdTop, x => `${x.term} (${x.count})`);
    renderList(missingEl, miss, x => x.term);
    renderList(suggestionsEl, sugg);

    showMessage("info", "Analysis complete. Consider addressing the missing terms in your bullets.");
  });
}

// ---------- Clear ----------
if (clearBtn) {
  clearBtn.addEventListener("click", () => {
    clearMessages();
    const ids = ["resume","jd","summary","topJd","missing","suggestions"];
    for (const id of ids) {
      const el = document.getElementById(id);
      if (!el) continue;
      if (el.tagName === "TEXTAREA" || el.tagName === "INPUT") {
        el.value = "";
      } else {
        el.innerHTML = "";
      }
    }
    try {
      localStorage.removeItem("resume_text");
      localStorage.removeItem("jd_text");
    } catch {}
    showMessage("success", "Cleared. You can paste fresh text anytime.");
  });
}

// ---------- AI Rewrite (secure backend) ----------
async function callRewriteAPI(resume, jd, opts = {}) {
  const r = await fetch("/api/rewrite", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ resume, jd, opts })
  });
  if (!r.ok) {
    const t = await r.text();
    throw new Error(`Rewrite failed: ${t}`);
  }
  const data = await r.json();
  return data.bullets || "";
}

const rewriteBtn = document.getElementById("rewriteBtn");

if (rewriteBtn) {
  const handler = withLoading(rewriteBtn, "Rewriting…", async () => {
    clearMessages();

    const resume = document.getElementById("resume").value;
    const jd = document.getElementById("jd").value;
    const summary = document.getElementById("summary");

    if (!resume.trim() || !jd.trim()) {
      showMessage("warn", "Please paste both your resume and the job description to rewrite.");
      return;
    }

     //ADD THIS BLOCK (Step B)
    const used = getRewritesUsed();
    if (used >= MAX_REWRITES_PER_DAY) {
      showMessage("warn", "Daily limit reached. Please come back tomorrow or sign up to unlock more.");
      return;
    }

    // Read Lesson 7 controls
    const tone = (document.getElementById("tone")?.value || "Professional").toLowerCase();
    const seniority = (document.getElementById("seniority")?.value || "Mid").toLowerCase();
    const role = (document.getElementById("role")?.value || "Engineering").toLowerCase();

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

if (summary) summary.innerHTML = `<h3>AI Suggested Bullets</h3><ul>${html}</ul>`;

incrementRewrites();
updateUsageCounter();
showMessage(
  "success",
  `AI rewrite complete. (${getRewritesUsed()}/${MAX_REWRITES_PER_DAY} used today)`
);
    } catch (e) {
      if (summary) summary.innerHTML = "";
      showMessage("error", `Rewrite failed: ${e.message}`);
    }
  });

  rewriteBtn.addEventListener("click", handler);
}

// ---------- Copy + Download ----------
function getCurrentBullets() {
  const summary = document.getElementById("summary");
  const lis = summary ? summary.querySelectorAll("li") : [];
  return Array.from(lis).map(li => li.textContent.trim()).filter(Boolean);
}

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
      showMessage("error", "Copy failed: " + err.message);
    }
  });
}

// Download real DOCX (backend generates via /api/download-docx)
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
        body: JSON.stringify({
          title: "AI Suggested Resume Bullets",
          bullets
        })
      });

      if (!r.ok) {
        const t = await r.text();
        throw new Error(`DOCX export failed: ${t}`);
      }

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
    } catch (e) {
      showMessage("error", e.message);
    }
  });

  downloadBtn.addEventListener("click", handler);
}
