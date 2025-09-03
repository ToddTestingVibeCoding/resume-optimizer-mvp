// api/analyze.js
// POST { resume, jobDesc } -> { analysis: "text..." }

const MODEL = "gpt-4o-mini";

module.exports = async (req, res) => {
  try {
    if (req.method !== "POST") {
      res.status(405).json({ error: "Method not allowed" });
      return;
    }

    const apiKey = process.env.OPENAI_API_KEY;
    if (!apiKey) {
      res.status(500).json({ error: "Server misconfig: missing OPENAI_API_KEY" });
      return;
    }

    // Read body
    let raw = "";
    await new Promise((resolve, reject) => {
      req.on("data", (c) => (raw += c));
      req.on("end", resolve);
      req.on("error", reject);
    });

    /** @type {{resume?:string, jobDesc?:string}} */
    let payload = {};
    try {
      payload = JSON.parse(raw || "{}");
    } catch {
      res.status(400).json({ error: "Invalid JSON" });
      return;
    }

    const resume = (payload.resume || "").toString().trim();
    const jobDesc = (payload.jobDesc || payload.jd || "").toString().trim();

    if (!resume || !jobDesc) {
      res.status(400).json({ error: "Please provide both resume and job description." });
      return;
    }

    const sys = [
      "You are a meticulous resume analyst.",
      "Compare resume vs. job description and summarize alignment in ~8–12 sentences.",
      "Include: strengths, gaps, key keywords missing, seniority match, tone fit, and 3 concrete improvements.",
      "Return plain text; no markdown; no bullets; concise and actionable."
    ].join(" ");

    const user = [
      "JOB DESCRIPTION:",
      jobDesc,
      "",
      "CANDIDATE RESUME:",
      resume,
      "",
      "Now provide the analysis."
    ].join("\n");

    const r = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${apiKey}`,
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        model: MODEL,
        messages: [
          { role: "system", content: sys },
          { role: "user", content: user }
        ],
        temperature: 0.3,
        max_tokens: 700
      })
    });

    if (!r.ok) {
      const detail = await r.text().catch(() => "");
      res.status(r.status).json({ error: "OpenAI error", detail });
      return;
    }

    const data = await r.json();
    const content = (data?.choices?.[0]?.message?.content || "").trim();

    res.status(200).json({ analysis: content });
  } catch (err) {
    console.error("analyze error:", err);
    res.status(500).json({ error: "Server error", detail: err?.message || String(err) });
  }
};

module.exports.config = { runtime: "nodejs" };