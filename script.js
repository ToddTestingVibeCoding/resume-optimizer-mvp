// ================================
// Resume Optimizer - script.js
// Safe reset, Lessons 6–9 consolidated
// ================================

// ---------- Utility: tokenizing & keyword stats ----------
const STOPWORDS = new Set([
  "the","and","or","to","a","of","in","for","port","on","with","is","are","as","at","by",
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

// ---------- Messages / spinner ----------
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
function spinnerHTML(text = "Working…") {
  return `<span class="spinner"></span>${text}`;
}

// ---------- Loading helper (button state) ----------
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

// ---------- Analyze Alignment (no AI) ----------
const analyzeBtn = document.getElementById("analyzeBtn");
const clearBtn = document.getElementById("clearBtn");

if (analyzeBtn) {
  analyzeBtn.addEventListener("click", () => {
    clearMessages();

    const resume = document.getElementById("resume")?.value || "";
    const jd = document.getElementById("jd")?.value || "";

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
  });
}

if (clearBtn) {
  clearBtn.addEventListener("click", () => {
    clearMessages();
    const ids = ["resume","jd","summary","topJd","missing","suggestions"];
    ids.forEach(id => {
      const el = document.getElementById(id);
      if (!el) return;
      if (el.tagName === "TEXTAREA" || el.tagName === "INPUT") el.value = "";
      else el.innerHTML = "";
    });
  });
}

// ---------- Daily rewrite limits ----------
const MAX_REWRITES_PER_DAY = 5;
const USAGE_KEY = "rewrite-usage-v1";

function todayKey() {
  const d = new Date();
  return `${d.getUTCFullYear()}-${d.getUTCMonth()+1}-${d.getUTCDate()}`;
}
function getRewritesUsed() {
  try {
    const raw = localStorage.getItem(USAGE_KEY);
    if (!raw) return 0;
    const { day, count } = JSON.parse(raw);
    return day === todayKey() ? (count || 0) : 0;
  } catch { return 0; }
}
function incrementRewrites() {
  try {
    const day = todayKey();
    const current = getRewritesUsed();
    localStorage.setItem(USAGE_KEY, JSON.stringify({ day, count: current + 1 }));
  } catch {}
}
function updateUsageCounter() {
  const el = document.getElementById("usageCounter");
  if (el) el.textContent = `${getRewritesUsed()} / ${MAX_REWRITES_PER_DAY} rewrites used today`;
}
updateUsageCounter();

// ---------- AI Rewrite (secure backend) ----------
async function callRewriteAPI(resume, jd, opts = {}) {
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

const rewriteBtn = document.getElementById("rewriteBtn");
if (rewriteBtn) {
  const handler = withLoading(rewriteBtn, "Rewriting…", async () => {
    clearMessages();

    const resume = document.getElementById("resume")?.value || "";
    const jd = document.getElementById("jd")?.value || "";
    const summary = document.getElementById("summary");

    if (!resume.trim() || !jd.trim()) {
      showMessage("error", "Please paste both your resume and the job description first.");
      return;
    }

    // Step B: enforce daily limit
    const used = getRewritesUsed();
    if (used >= MAX_REWRITES_PER_DAY) {
      showMessage("warn", "Daily limit reached. Please come back tomorrow or sign up to unlock more.");
      return;
    }

    // Lesson 7 controls (optional dropdowns in your HTML)
    const tone = (document.getElementById("tone")?.value || "Professional").toLowerCase();
    const seniority = (document.getElementById("seniority")?.value || "Mid").toLowerCase();
    const role = (document.getElementById("role")?.value || "Engineering").toLowerCase();

    if (summary) summary.innerHTML = spinnerHTML("Rewriting with AI…");

    try {
      const bullets = await callRewriteAPI(resume, jd, { tone, seniority, role });

      const html = bullets
        .split("\n").map(l => l.trim()).filter(Boolean)
        .map(l => l.replace(/^[-•*\d.)\s]+/, "")) // strip markers
        .map(l => `<li>${l}</li>`).join("");

      if (summary) summary.innerHTML = `<h3>AI Suggested Bullets</h3><ul>${html}</ul>`;

      // usage accounting + UI
      incrementRewrites();
      updateUsageCounter();
      showMessage("success", `AI rewrite complete. (${getRewritesUsed()}/${MAX_REWRITES_PER_DAY} used today)`);
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

// Download real DOCX (backend /api/download-docx)
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

// ---------- Resume file upload → /api/extract ----------
const uploadBtn = document.getElementById("uploadBtn");
const resumeFileInput = document.getElementById("resumeFile");

if (uploadBtn && resumeFileInput) {
  // Open hidden file input
  uploadBtn.addEventListener("click", () => resumeFileInput.click());

  // Send chosen file to backend (FormData)
  resumeFileInput.addEventListener("change", async () => {
    const file = resumeFileInput.files?.[0];
    if (!file) {
      showMessage("warn", "No file selected.");
      return;
    }

    const formData = new FormData();
    // IMPORTANT: key must be "file" (backend expects this first)
    formData.append("file", file);

    try {
      showMessage("info", "Extracting text from file...");
      const r = await fetch("/api/extract", { method: "POST", body: formData }); // no Content-Type header
      if (!r.ok) {
        const t = await r.text();
        throw new Error(t);
      }
      const data = await r.json();
      const resumeEl = document.getElementById("resume");
      if (resumeEl) resumeEl.value = data.text || "";
      showMessage("success", "File text extracted and added to your resume.");
    } catch (err) {
      showMessage("error", "Upload failed: " + (err?.message || err));
    } finally {
      // allow re-selecting the same file
      resumeFileInput.value = "";
    }
  });
}