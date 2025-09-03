// api/rewrite.js
// POST { resume, jd, options?: { tone, seniority, role } } -> { bullets: "• line\n• line\n..." }

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

    // Read body (no body-parser in Vercel functions)
    let raw = "";
    await new Promise((resolve, reject) => {
      req.on("data", (c) => (raw += c));
      req.on("end", resolve);
      req.on("error", reject);
    });

    /** @type {{resume?:string, jd?:string, options?:{tone?:string, seniority?:string, role?:string}}} */
    let payload = {};
    try {
      payload = JSON.parse(raw || "{}");
    } catch {
      res.status(400).json({ error: "Invalid JSON" });
      return;
    }

    const resume = (payload.resume || "").toString().trim();
    const jd = (payload.jd || "").toString().trim();
    const tone = (payload.options?.tone || "professional").toString().toLowerCase();
    const seniority = (payload.options?.seniority || "mid").toString().toLowerCase();
    const role = (payload.options?.role || "").toString();

    if (!resume || !jd) {
      res.status(400).json({ error: "Please provide both resume and job description." });
      return;
    }

    const sys = [
      "You are an expert resume writer.",
      "Return 6–10 impact bullets tailored to the job description.",
      "Each bullet must be concise, action-oriented, and quantified where reasonable.",
      "Align wording with the JD while staying truthful to the resume.",
      "Use plain text bullets, one per line. No numbering, no extra prose."
    ].join(" ");

    const user = [
      `Tone: ${tone}; Seniority: ${seniority}; Role context: ${role || "unspecified"}.`,
      "",
      "JOB DESCRIPTION:",
      jd,
      "",
      "CANDIDATE RESUME:",
      resume,
      "",
      "Now produce only the bullets (one per line)."
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
        temperature: 0.5,
        max_tokens: 600
      })
    });

    if (!r.ok) {
      const detail = await r.text().catch(() => "");
      // Bubble up friendly errors your UI formats nicely
      res.status(r.status).json({ error: "OpenAI error", detail });
      return;
    }

    const data = await r.json();
    const content = (data?.choices?.[0]?.message?.content || "").trim();

    // Normalize to clean bullet lines
    const lines = content
      .split("\n")
      .map(l => l.trim())
      .filter(Boolean)
      .map(l => l.replace(/^[-•*\d.)\s]+/, "")); // strip leading markers

    if (!lines.length) {
      res.status(200).json({ bullets: "" });
      return;
    }

    // Re-join with • markers so your UI shows them nicely
    const bullets = lines.map(l => `• ${l}`).join("\n");
    res.status(200).json({ bullets });
  } catch (err) {
    console.error("rewrite error:", err);
    res.status(500).json({ error: "Server error", detail: err?.message || String(err) });
  }
};

// Vercel runtime (avoid "nodejs20.x" error)
module.exports.config = { runtime: "nodejs" };