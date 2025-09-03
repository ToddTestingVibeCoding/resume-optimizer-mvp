// api/analyze.js
// Summarizes alignment + extracts top JD terms, missing terms, and suggestions.
// Requires: process.env.OPENAI_API_KEY (and optional OPENAI_MODEL)

const DEFAULT_MODEL = process.env.OPENAI_MODEL || "gpt-4o-mini";

module.exports = async (req, res) => {
  try {
    if (req.method !== "POST") {
      res.status(405).json({ error: "Method not allowed" });
      return;
    }

    // Read body safely
    let body = "";
    await new Promise((resolve, reject) => {
      req.on("data", (c) => (body += c));
      req.on("end", resolve);
      req.on("error", reject);
    });

    let payload = {};
    try {
      payload = JSON.parse(body || "{}");
    } catch {
      res.status(400).json({ error: "Invalid JSON" });
      return;
    }

    const resume = (payload.resume || "").toString();
    const jobDesc = (payload.jobDesc || payload.jd || "").toString();
    if (!resume.trim() || !jobDesc.trim()) {
      res.status(400).json({ error: "Missing resume or jobDesc" });
      return;
    }

    const apiKey = process.env.OPENAI_API_KEY;
    if (!apiKey) {
      res.status(500).json({ error: "Server not configured (API key missing)" });
      return;
    }

    // Prompt asks for strict JSON
    const system = `You are an expert resume coach. Return STRICT JSON only with keys:
{
  "analysis": string,                 // a concise paragraph
  "topTerms": [{"term": string, "count": number}], // 10–20 top JD terms (estimated counts OK)
  "missingTerms": [{"term": string}], // subset not present in resume
  "suggestions": [string]             // 5–10 action suggestions
}
No extra text. No markdown.`;

    const user = `JOB DESCRIPTION:
"""
${jobDesc}
"""

CANDIDATE RESUME:
"""
${resume}
"""

Tasks:
1) Summarize alignment in one tight paragraph.
2) Extract the most important skills/keywords from the JD as topTerms (10–20).
3) Identify which top JD terms are missing from the resume as missingTerms.
4) Provide 5–10 concrete suggestions to improve alignment.`;

    const r = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        model: DEFAULT_MODEL,
        temperature: 0.2,
        messages: [
          { role: "system", content: system },
          { role: "user", content: user }
        ]
      })
    });

    if (!r.ok) {
      const detail = await safeText(r);
      const status = r.status;
      // Bubble a rate-limit-ish status so the client can retry
      if (status === 429 || (status >= 500 && status < 600)) {
        res.status(status).json({ error: "Upstream AI error", detail });
        return;
      }
      res.status(502).json({ error: "Upstream AI error", detail });
      return;
    }

    const data = await r.json();
    const raw = data?.choices?.[0]?.message?.content || "";

    // Parse strict JSON
    let parsed;
    try {
      parsed = JSON.parse(raw);
    } catch {
      // Fallback: wrap whole text as analysis if model drifted
      parsed = {
        analysis: raw || "Analysis unavailable.",
        topTerms: [],
        missingTerms: [],
        suggestions: []
      };
    }

    // Normalize shapes for the front-end
    const topTerms = Array.isArray(parsed.topTerms)
      ? parsed.topTerms.map(t =>
          typeof t === "string" ? { term: t, count: 1 } : { term: t.term, count: t.count ?? 1 }
        )
      : [];
    const missingTerms = Array.isArray(parsed.missingTerms)
      ? parsed.missingTerms.map(t => (typeof t === "string" ? { term: t } : { term: t.term }))
      : [];
    const suggestions = Array.isArray(parsed.suggestions) ? parsed.suggestions : [];

    res.status(200).json({
      analysis: parsed.analysis || "Analysis unavailable.",
      topTerms,
      missingTerms,
      suggestions
    });
  } catch (err) {
    console.error("analyze error:", err);
    res.status(500).json({ error: "Server error", detail: err?.message || String(err) });
  }
};

async function safeText(resp) {
  try { return await resp.text(); } catch { return ""; }
}

// Vercel runtime (avoid “nodejs20.x” error)
module.exports.config = {
  runtime: "nodejs"
};