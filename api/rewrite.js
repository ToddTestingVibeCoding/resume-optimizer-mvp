// /api/rewrite.js
// Serverless function (CommonJS). Expects OPENAI_API_KEY in env.
module.exports = async (req, res) => {
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  try {
    const { resume, jd, opts = {} } = req.body || {};
    if (!resume || !jd) {
      return res.status(400).json({ error: "Missing resume or job description" });
    }

    // Lesson 7 options with sensible defaults
    const tone = String(opts.tone || "professional").toLowerCase();
    const seniority = String(opts.seniority || "mid").toLowerCase();
    const role = String(opts.role || "engineering").toLowerCase();

    const prompt = `
You are a resume rewriting assistant.

Context:
- Role focus: ${role}
- Seniority: ${seniority}
- Tone: ${tone}

Instructions:
- Rewrite or add 3–5 resume bullet points tightly aligned to the job description.
- Stay factual to the resume; do NOT invent experience, titles, or employers.
- Prefer strong action verbs, measurable outcomes, and keywords from the JD.
- Keep each bullet on one line; avoid duplicate phrasing and fluff.
- Adapt diction to the selected tone and seniority (e.g., leadership scope for manager/lead).

Resume:
${resume}

Job description:
${jd}

Return bullets only (no headings or commentary).
`.trim();

    const r = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${process.env.OPENAI_API_KEY}`
      },
      body: JSON.stringify({
        model: "gpt-4o-mini",
        messages: [{ role: "user", content: prompt }],
        temperature: 0.7
      })
    });

    if (!r.ok) {
      const detail = await r.text();
      return res.status(500).json({ error: "OpenAI error", detail });
    }

    const data = await r.json();
    const content = data?.choices?.[0]?.message?.content || "";
    return res.status(200).json({ bullets: content });
  } catch (err) {
    return res.status(500).json({ error: err.message || "Server error" });
  }
};
