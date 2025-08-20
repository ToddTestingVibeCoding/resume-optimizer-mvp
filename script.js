// Basic keyword extraction + gap check (quick-and-dirty, AI-free)
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
  // Light-touch phrasing to integrate keywords naturally
  return missing.slice(0, 10).map(({term}) => 
    `Add a bullet using “${term}” in context (e.g., quantified impact or tool usage).`
  );
}

function renderList(el, items, formatter = (x)=>x) {
  el.innerHTML = "";
  for (const item of items) {
    const li = document.createElement("li");
    li.textContent = formatter(item);
    el.appendChild(li);
  }
}

document.getElementById("analyzeBtn").addEventListener("click", () => {
  const resume = document.getElementById("resume").value;
  const jd = document.getElementById("jd").value;
  const resumeCounts = keywordCounts(resume);
  const jdCounts = keywordCounts(jd);

  const jdTop = topTerms(jdCounts, 20);
  const miss = missingTerms(jdTop, resumeCounts);
  const sugg = roughSuggestions(miss);

  // Summary
  const coverage = ((jdTop.length - miss.length) / Math.max(1, jdTop.length) * 100).toFixed(0);
  document.getElementById("summary").innerHTML = `
    <p><strong>Coverage:</strong> ${coverage}% of top JD terms appear in your resume.</p>
    <p><strong>Next step:</strong> Use “Suggested Additions” to weave missing terms into impact bullets.</p>
  `;

  // Lists
  renderList(document.getElementById("topJd"), jdTop, x => `${x.term} (${x.count})`);
  renderList(document.getElementById("missing"), miss, x => x.term);
  renderList(document.getElementById("suggestions"), sugg);
});

document.getElementById("clearBtn").addEventListener("click", () => {
  document.getElementById("resume").value = "";
  document.getElementById("jd").value = "";
  document.getElementById("summary").innerHTML = "";
  document.getElementById("topJd").innerHTML = "";
  document.getElementById("missing").innerHTML = "";
  document.getElementById("suggestions").innerHTML = "";
});

// ---- AI Rewrite integration ----
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
      summary.innerHTML = `<p style="color:#b00020;">Please paste both your resume and the job description first.</p>`;
      return;
    }

    // Optional loading state (works even if you didn’t add the CSS yet)
    rewriteBtn.disabled = true;
    const originalText = rewriteBtn.textContent;
    rewriteBtn.textContent = "Rewriting…";

    summary.innerHTML = "<em>Rewriting with AI…</em>";

    try {
      const bullets = await callRewriteAPI(resume, jd);

      // Format nicely as a list
      const html = bullets
        .split("\n")
        .map(l => l.trim())
        .filter(Boolean)
        .map(l => l.replace(/^[-•*\d.)\s]+/, "")) // strip leading markers
        .map(l => `<li>${l}</li>`)
        .join("");

      summary.innerHTML = `<h3>AI Suggested Bullets</h3><ul>${html}</ul>`;
    } catch (e) {
      summary.innerHTML = `<p style="color:#b00020;">${e.message}</p>`;
    } finally {
      rewriteBtn.disabled = false;
      rewriteBtn.textContent = originalText;
    }
  });
}

// ---- Copy & Download ----
const copyBtn = document.getElementById("copyBtn");
const downloadBtn = document.getElementById("downloadBtn");

function getCurrentBullets() {
  const summary = document.getElementById("summary");
  const lis = summary.querySelectorAll("li");
  return Array.from(lis).map(li => li.textContent);
}

// Copy to clipboard
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

// Download as DOCX
// ---- Collect current AI bullets from the page ----
function getCurrentBullets() {
  const summary = document.getElementById("summary");
  const lis = summary ? summary.querySelectorAll("li") : [];
  return Array.from(lis).map(li => li.textContent.trim()).filter(Boolean);
}

const downloadBtn = document.getElementById("downloadBtn");

if (downloadBtn) {
  downloadBtn.addEventListener("click", async () => {
    const bullets = getCurrentBullets();
    if (!bullets.length) {
      alert("No AI bullets to download yet!");
      return;
    }

    // simple loading state
    downloadBtn.disabled = true;
    const originalText = downloadBtn.textContent;
    downloadBtn.textContent = "Preparing DOCX…";

    try {
      // 🔽 Call your Vercel backend to generate a proper DOCX
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

      // 🔽 Stream the Word file back and trigger download
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
