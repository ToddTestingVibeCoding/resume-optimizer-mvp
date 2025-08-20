// ================================
// Resume Optimizer - script.js
// Safe reset version
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

// ---------- Analyze Alignment (no AI) ----------
const analyzeBtn = document.getElementById("analyzeBtn");
const clearBtn = document.getElementById("clearBtn");

if (analyzeBtn) {
  analyzeBtn.addEventListener("click", () => {
    const resume = document.getElementById("resume").value;
    const jd = document.getElementById("jd").value;

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
  });
}

// ---------- AI Rewrite (secure backend) ----------
async function callRewriteAPI(resume, jd) {
  const r = await fetch("/api/rewrite", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ resume, jd })
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
  rewriteBtn.addEventListener("click", async () => {
    const resume = document.getElementById("resume").value;
    const jd = document.getElementById("jd").value;
    const summary = document.getElementById("summary");

    if (!resume.trim() || !jd.trim()) {
      if (summary) summary.innerHTML = `<p style="color:#b00020;">Please paste both your resume and the job description first.</p>`;
      return;
    }

    rewriteBtn.disabled = true;
    const originalText = rewriteBtn.textContent;
    rewriteBtn.textContent = "Rewriting…";
    if (summary) summary.innerHTML = "<em>Rewriting with AI…</em>";

    try {
      const bullets = await callRewriteAPI(resume, jd);

      const html = bullets
        .split("\n")
        .map(l => l.trim())
        .filter(Boolean)
        .map(l => l.replace(/^[-•*\d.)\s]+/, "")) // strip any leading markers
        .map(l => `<li>${l}</li>`)
        .join("");

      if (summary) summary.innerHTML = `<h3>AI Suggested Bullets</h3><ul>${html}</ul>`;
    } catch (e) {
      if (summary) summary.innerHTML = `<p style="color:#b00020;">${e.message}</p>`;
    } finally {
      rewriteBtn.disabled = false;
      rewriteBtn.textContent = originalText;
    }
  });
}

// ---------- Copy + Download helpers ----------
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
      alert("No AI bullets to copy yet!");
      return;
    }
    try {
      await navigator.clipboard.writeText(bullets.join("\n"));
      alert("Copied to clipboard ✅");
    } catch (err) {
      alert("Copy failed: " + err.message);
    }
  });
}

// Download real DOCX (backend generates via /api/download-docx)
const downloadBtn = document.getElementById("downloadBtn");
if (downloadBtn) {
  downloadBtn.addEventListener("click", async () => {
    const bullets = getCurrentBullets();
    if (!bullets.length) {
      alert("No AI bullets to download yet!");
      return;
    }

    downloadBtn.disabled = true;
    const originalText = downloadBtn.textContent;
    downloadBtn.textContent = "Preparing DOCX…";

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
    } catch (e) {
      alert(e.message);
    } finally {
      downloadBtn.disabled = false;
      downloadBtn.textContent = originalText;
    }
  });
}
