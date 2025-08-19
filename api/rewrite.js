// /api/rewrite.js
export default async function handler(req, res) {
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  try {
    const { resume, jd } = req.body || {};
    if (!resume || !jd) {
      return res.status(400).json({ error: "Missing resume or job description" });
    }

    const prompt = `
You are a resume rewriting assistant.
Resume text:
${resume}

Job description:
${jd}

Rewrite or add 3–5 resume bullet points tightly aligned to the job description.
- Be factual based on provided resume; do NOT fabricate experience.
- Use action verbs, measurable outcomes, and relevant keywords from the JD.
- Output bullets only.
`;

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
      const text = await r.text();
      return res.status(500).json({ error: "OpenAI error", detail: text });
    }

    const data = await r.json();
    const content = data?.choices?.[0]?.message?.content || "";
    return res.status(200).json({ bullets: content });
  } catch (err) {
    return res.status(500).json({ error: err.message || "Server error" });
  }
}
