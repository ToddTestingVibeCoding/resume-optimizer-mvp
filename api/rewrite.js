// api/rewrite.js
// Produces tailored resume bullets given resume + JD (+ optional { tone, seniority, role }).
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
    const jd = (payload.jd || payload.jobDesc || "").toString();
    const options = payload.options || {};
    const tone = (options.tone || "Professional").toString();
    const seniority = (options.seniority || "Mid").toString();
    const role = (options.role || "General").toString();

    if (!resume.trim() || !jd.trim()) {
      res.status(400).json({ error: "Missing resume or jd" });
      return;
    }

    const apiKey = process.env.OPENAI_API_KEY;
    if (!apiKey) {
      res.status(500).json({ error: "Server not configured (API key missing)" });
      return;
    }

    // Ask for STRICT JSON array of bullets
    const system = `You are an expert resume writer. Return STRICT JSON only:
{ "bullets": [ string, ... ] }
Rules:
- 6–10 bullets max.
- Each bullet: quantified impact (numbers, %), relevant tools, outcome.
- Style tone = "${tone}", seniority = "${seniority}", target role = "${role}".
- No intro/outro, no markdown, no extra keys.`;

    const user = `Job Description:
"""
${jd}
"""

Candidate Resume:
"""
${resume}
"""

Task:
Write 6–10 achievement bullets tailored to the JD. Use strong verbs, measurable results, relevant tools, and outcomes. Strict JSON only.`;

    const r = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        model: DEFAULT_MODEL,
        temperature: 0.5,
        messages: [
          { role: "system", content: system },
          { role: "user", content: user }
        ]
      })
    });

    if (!r.ok) {
      const detail = await safeText(r);
      const status = r.status;
      if (status === 429 || (status >= 500 && status < 600)) {
        res.status(status).json({ error: "Upstream AI error", detail });
        return;
      }
      res.status(502).json({ error: "Upstream AI error", detail });
      return;
    }

    const data = await r.json();
    const raw = data?.choices?.[0]?.message?.content || "";

    let parsed;
    try {
      parsed = JSON.parse(raw);
    } catch {
      // Fallback: split lines into bullets
      const bullets = raw
        .split("\n")
        .map(l => l.replace(/^[-•*\d.)\s]+/, "").trim())
        .filter(Boolean);
      res.status(200).json({ bullets });
      return;
    }

    const bullets = Array.isArray(parsed.bullets)
      ? parsed.bullets.map(b => (typeof b === "string" ? b.trim() : String(b))).filter(Boolean)
      : [];

    res.status(200).json({ bullets });
  } catch (err) {
    console.error("rewrite error:", err);
    res.status(500).json({ error: "Server error", detail: err?.message || String(err) });
  }
};

async function safeText(resp) {
  try { return await resp.text(); } catch { return ""; }
}

module.exports.config = {
  runtime: "nodejs"
};