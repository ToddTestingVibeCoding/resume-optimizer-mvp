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