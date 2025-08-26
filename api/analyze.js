// api/analyze.js  (CommonJS, Vercel-friendly)

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

module.exports = async (req, res) => {
  try {
    if (req.method !== "POST") {
      res.setHeader("Allow", "POST");
      return res.status(405).json({ error: "Method not allowed" });
    }

    // Vercel usually parses JSON when header is application/json,
    // but be resilient if body arrives as a string.
    let body = req.body;
    if (typeof body === "string") {
      try { body = JSON.parse(body); } catch (_) { body = {}; }
    } else if (!body) {
      body = {};
    }

    const resume = (body.resume || "").trim();
    const jobDesc = (body.jobDesc || body.jd || "").trim();

    if (!resume || !jobDesc) {
      return res.status(400).json({ error: "Missing resume or jobDesc" });
    }

    const resumeCounts = keywordCounts(resume);
    const jdCounts = keywordCounts(jobDesc);
    const jdTop = topTerms(jdCounts, 20);
    const miss = missingTerms(jdTop, resumeCounts);
    const coverage = Math.round(((jdTop.length - miss.length) / Math.max(1, jdTop.length)) * 100);

    const lines = [];
    lines.push(`Coverage of top JD terms: ${coverage}%`);
    if (miss.length) {
      lines.push(`Missing terms to consider: ${miss.slice(0, 10).map(m => m.term).join(", ")}`);
    } else {
      lines.push("Great! Your resume already covers the top JD terms.");
    }
    lines.push("");
    lines.push("Tips:");
    lines.push("- Add bullets that weave missing terms into real accomplishments.");
    lines.push("- Quantify outcomes (%, $, time saved) and name key tools.");

    return res.status(200).json({ analysis: lines.join("\n") });
  } catch (err) {
    console.error("analyze error:", err);
    return res.status(500).json({ error: "Server error in /api/analyze" });
  }
};