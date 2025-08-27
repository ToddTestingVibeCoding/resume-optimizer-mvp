// ================================
// Resume Optimizer - script.js
// Lessons 6–12 consolidated + dynamic credits after email
// ================================

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

// ---------- Simple alert messaging ----------
function showMessage(type, text) {
  // types: info | success | warn | error
  let box = document.getElementById("messages");
  if (!box) box = document.getElementById("summary");
  if (!box) return;
  const div = document.createElement("div");
  div.className = `alert ${type}`;
  div.textContent = text;
  box.prepend(div);
  setTimeout(() => { if (div?.parentNode) div.parentNode.removeChild(div); }, 5000);
}

// --- Friendly error mapping (Lesson 11.B) ---
function friendlyError(err) {
  try {
    const raw = typeof err === "string" ? err : (err?.message || "");
    if (!raw) return "Something went wrong. Please try again.";
    if (/invalid_api_key|Incorrect API key/i.test(raw)) {
      return "API key issue: check your OpenAI key in Vercel → Settings → Environment Variables.";
    }
    if (/rate[_\s-]?limit|rpm|requests per min/i.test(raw)) {
      return "We’re hitting a rate limit. Please wait ~30–60 seconds and try again.";
    }
    if (/model.*not.*found|unsupported.*model/i.test(raw)) {
      return "The selected AI model isn’t available. We’ll switch models on the backend.";
    }
    if (/FUNCTION_INVOCATION_FAILED|vercel/i.test(raw)) {
      return "The server function failed to run. Try again in a moment.";
    }
    if (/413|payload too large/i.test(raw)) {
      return "That file or text is too large to process. Try a smaller file or trim the text.";
    }
    if (/415|unsupported media/i.test(raw)) {
      return "That file type isn’t supported. Please upload a .docx, .pdf, or .txt file.";
    }
    if (/No file uploaded/i.test(raw)) {
      return "No file was received. Pick a .docx, .pdf, or .txt with the Upload button.";
    }
    try {
      const asJSON = JSON.parse(raw);
      if (asJSON?.error?.message) return asJSON.error.message;
      if (asJSON?.detail?.error?.message) return asJSON.detail.error.message;
      if (asJSON?.detail) return String(asJSON.detail);
      if (asJSON?.error) return String(asJSON.error);
    } catch (_) {}
    return raw.replace(/["{}\\]+/g, "").slice(0, 240);
  } catch (_) {
    return "Unexpected error. Please try again.";
  }
}

// ---------- Loading helpers ----------
function withLoading(btn, labelWhileLoading, fn) {
  return async function(...args) {
    let original;
    if (btn) {
      btn.disabled = true;
      original = btn.innerHTML;
      btn.innerHTML = `<span class="spinner"></span>${labelWhileLoading}`;
    }
    try {
      return await fn(...args);
    } finally {
      if (btn) {
        btn.disabled = false;
        btn.innerHTML = original;
      }
    }
  };
}
function spinnerHTML(text = "Working…") {
  return `<span class="spinner"></span>${text}`;
}

// ---------- Daily usage counter (dynamic cap after email) ----------
const BASE_DAILY_LIMIT = 5;
function getDailyLimit() {
  return localStorage.getItem("userEmail") ? BASE_DAILY_LIMIT + 5 : BASE_DAILY_LIMIT;
}
function getUsageKey() {
  const d = new Date();
  return `rewrites_${d.getFullYear()}-${d.getMonth()+1}-${d.getDate()}`;
}
function getRewritesUsed() {
  return parseInt(localStorage.getItem(getUsageKey()) || "0", 10);
}
function incrementRewrites() {
  const key = getUsageKey();
  const used = getRewritesUsed() + 1;
  localStorage.setItem(key, String(used));
  updateUsageCounter();
}
function updateUsageCounter() {
  const el = document.getElementById("usageCounter");
  if (el) {
    el.textContent = `${getRewritesUsed()} / ${getDailyLimit()} rewrites used today`;
  }
}
updateUsageCounter(); // init on load

// ===== Character counters (Lesson 11) =====
function wireCharCounter(textareaId, counterId) {
  const ta = document.getElementById(textareaId);
  const cnt = document.getElementById(counterId);
  if (!ta || !cnt) return;
  const sync = () => (cnt.textContent = `${ta.value.length} characters`);
  ta.addEventListener("input", sync);
  sync();
}
wireCharCounter("resume", "resumeCount");
wireCharCounter("jd", "jdCount");

// ---------- Analyze Alignment (server) ----------
const analyzeBtn = document.getElementById("analyzeBtn");
if (analyzeBtn) {
  const handler = withLoading(analyzeBtn, "Analyzing…", async () => {
    const resume = (document.getElementById("resume")?.value || "").trim();
    const jobDesc =
      (document.getElementById("jd")?.value ||
       document.getElementById("jobDesc")?.value ||
       "").trim();

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

      const summary = document.getElementById("summary");
      if (summary) {
        summary.innerHTML = `
          <div class="card">
            <h3>Alignment Analysis</h3>
            <p>${(data.analysis || "").replace(/\n/g, "<br>")}</p>
          </div>
        `;
      }
      showMessage("success", "Alignment analysis complete.");
    } catch (err) {
      showMessage("error", friendlyError(err));
    }
  });

  analyzeBtn.addEventListener("click", handler);
}

// ---------- Clear ----------
const clearBtn = document.getElementById("clearBtn");
if (clearBtn) {
  clearBtn.addEventListener("click", () => {
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
    updateUsageCounter();
    showMessage("info", "Cleared fields.");
  });
}

// ---------- AI Rewrite (secure backend) ----------
async function callRewriteAPI(resume, jd, opts = {}) {
  const r = await fetch("/api/rewrite", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ resume, jd, ...opts })
  });
  if (!r.ok) throw new Error(await r.text());
  const data = await r.json();
  return data.bullets || "";
}

const rewriteBtn = document.getElementById("rewriteBtn");
if (rewriteBtn) {
  const handler = withLoading(rewriteBtn, "Rewriting…", async () => {
    const resume = (document.getElementById("resume")?.value || "").trim();
    const jd = (document.getElementById("jd")?.value || "").trim();
    const summary = document.getElementById("summary");

    if (!resume || !jd) {
      showMessage("warn", "Please paste both Resume and Job Description first.");
      return;
    }

    // Daily limit gate (dynamic)
    const used = getRewritesUsed();
    const cap = getDailyLimit();
    if (used >= cap) {
      const hasEmail = !!localStorage.getItem("userEmail");
      if (!hasEmail) {
        openEmailModal();
        showMessage("info", "You’ve reached today’s free limit. Add your email to unlock more.");
      } else {
        showMessage("warn", `Daily limit reached (${used}/${cap}). Please come back tomorrow.`);
      }
      return;
    }

    if (summary) summary.innerHTML = spinnerHTML("Rewriting with AI…");

    try {
      // (Optional future: tone/seniority/role controls)
      const bullets = await callRewriteAPI(resume, jd, {});
      const html = bullets
        .split("\n")
        .map(l => l.trim())
        .filter(Boolean)
        .map(l => l.replace(/^[-•*\d.)\s]+/, "")) // strip leading markers
        .map(l => `<li>${l}</li>`)
        .join("");

      if (summary) summary.innerHTML = `<h3>AI Suggested Bullets</h3><ul>${html}</ul>`;
      incrementRewrites();
      showMessage("success", `AI rewrite complete. (${getRewritesUsed()}/${getDailyLimit()} used today)`);
    } catch (e) {
      if (summary) summary.innerHTML = "";
      showMessage("error", friendlyError(e));
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
  const handler = withLoading(copyBtn, "Copying…", async () => {
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
  copyBtn.addEventListener("click", handler);
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
        body: JSON.stringify({ title: "AI Suggested Resume Bullets", bullets })
      });
      if (!r.ok) throw new Error(`DOCX export failed: ${await r.text()}`);

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
      showMessage("error", friendlyError(e));
    }
  });
  downloadBtn.addEventListener("click", handler);
}

// ---------- Resume file upload → /api/extract ----------
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

    const originalHTML = uploadBtn.innerHTML;
    uploadBtn.disabled = true;
    uploadBtn.innerHTML = `<span class="spinner"></span>Uploading…`;

    const formData = new FormData();
    formData.append("file", file); // backend expects key "file" first

    try {
      const r = await fetch("/api/extract", { method: "POST", body: formData });
      if (!r.ok) throw new Error(await r.text());
      const data = await r.json();
      const resumeEl = document.getElementById("resume");
      if (resumeEl) resumeEl.value = data.text || "";
      showMessage("success", "File text extracted and added to your resume.");
      const cnt = document.getElementById("resumeCount");
      if (cnt) cnt.textContent = `${(resumeEl?.value || "").length} characters`;
    } catch (err) {
      showMessage("error", friendlyError(err));
    } finally {
      uploadBtn.disabled = false;
      uploadBtn.innerHTML = originalHTML;
      resumeFileInput.value = "";
    }
  });
}

// ---------- Local (no-AI) Alignment Helpers (side cards) ----------
function runLocalAlignment(resumeText, jdText) {
  const summaryEl = document.getElementById("summary");
  const topJdEl = document.getElementById("topJd");
  const missingEl = document.getElementById("missing");
  const suggestionsEl = document.getElementById("suggestions");

  const resumeCounts = keywordCounts(resumeText);
  const jdCounts = keywordCounts(jdText);

  const jdTop = topTerms(jdCounts, 20);
  const miss = missingTerms(jdTop, resumeCounts);
  const sugg = roughSuggestions(miss);

  const coverage = ((jdTop.length - miss.length) / Math.max(1, jdTop.length) * 100).toFixed(0);
  if (summaryEl) {
    summaryEl.innerHTML = `
      <p><strong>Coverage:</strong> ${coverage}% of top JD terms appear in your resume.</p>
      <p class="muted">Next step: Use “Suggested Additions” to weave missing terms into impact bullets.</p>
    `;
  }

  renderList(topJdEl, jdTop, x => `${x.term} (${x.count})`);
  renderList(missingEl, miss, x => x.term);
  renderList(suggestionsEl, sugg);
}
if (analyzeBtn) {
  analyzeBtn.addEventListener("click", () => {
    const resume = (document.getElementById("resume")?.value || "");
    const jd = (document.getElementById("jd")?.value || "");
    if (resume && jd) runLocalAlignment(resume, jd);
  });
}

// ===== Lesson 12: Email Modal =====
function openEmailModal() {
  const modal = document.getElementById("emailModal");
  if (!modal) return;
  modal.style.display = "block";
  modal.setAttribute("aria-hidden", "false");
}
function closeEmailModal() {
  const modal = document.getElementById("emailModal");
  if (!modal) return;
  modal.style.display = "none";
  modal.setAttribute("aria-hidden", "true");
}
function wireEmailModal() {
  const modal = document.getElementById("emailModal");
  if (!modal) return;

  modal.addEventListener("click", (e) => {
    const t = e.target;
    if (t?.dataset?.close === "true") closeEmailModal();
  });

  const form = document.getElementById("emailForm");
  const input = document.getElementById("emailInput");
  const submitBtn = document.getElementById("emailSubmitBtn");
  if (!form || !input || !submitBtn) return;

  form.addEventListener("submit", async (e) => {
    e.preventDefault();
    const email = (input.value || "").trim();

    if (!email || !input.checkValidity()) {
      showMessage("warn", "Please enter a valid email address.");
      input.focus();
      return;
    }

    // Store locally so we don’t prompt again on this device
    localStorage.setItem("userEmail", email);

    // Optional backend capture (non-blocking)
    try {
      submitBtn.disabled = true;
      submitBtn.textContent = "Saving…";
      await fetch("/api/lead", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, ts: Date.now(), ua: navigator.userAgent })
      });
    } catch (_) {
      // non-fatal
    } finally {
      submitBtn.disabled = false;
      submitBtn.textContent = "Continue";
    }

    closeEmailModal();
    updateUsageCounter(); // reflect new higher cap
    showMessage("success", "Thanks! Extra credits unlocked for today.");
  });
}
document.addEventListener("DOMContentLoaded", wireEmailModal);