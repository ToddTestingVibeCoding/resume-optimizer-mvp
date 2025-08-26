// api/rewrite.js  (CommonJS, Vercel-friendly)

const DEFAULT_MODEL = process.env.OPENAI_MODEL || "gpt-4o-mini";

function safeJson(req) {
  let body = req.body;
  if (typeof body === "string") {
    try { body = JSON.parse(body); } catch { body = {}; }
  } else if (!body) {
    body = {};
  }
  return body;
}

function buildPrompt({ resume, jd, tone = "professional", seniority = "mid", role = "general" }) {
  const sys = `
You are a resume optimization assistant. Write truthful, ATS-friendly, impact-oriented bullet points that could be pasted into a resume.
Rules:
- Only output bullets, one per line (no numbering, no markdown).
- 5–8 bullets max.
- Use strong action verbs and quantify impact (%, $, time) where plausible from the resume.
- Tailor to the job description while staying faithful to the candidate's actual experience.
- Incorporate relevant terminology from the JD only if supported by the resume; otherwise suggest adjacent phrasing.
- Tone: ${tone}. Seniority target: ${seniority}. Role family: ${role}.
`.trim();

  const user = `
RESUME:
${resume}

JOB DESCRIPTION:
${jd}

Task: Produce 5–8 tailored resume bullets (one per line). Do NOT include any headers or extra text.
`.trim();

  return { system: sys, user };
}

async function callOpenAI({ apiKey, model, system, user }) {
  const r = await fetch("https://api.openai.com/v1/chat/completions", {
    method: "POST",
    headers: {
      "Authorization": `Bearer ${apiKey}`,
      "Content-Type": "application/json"
    },
    body: JSON.stringify({
      model,
      temperature: 0.6,
      max_tokens: 600,
      messages: [
        { role: "system", content: system },
        { role: "user", content: user }
      ]
    })
  });

  if (!r.ok) {
    const text = await r.text();
    // Try to shape common errors nicely
    if (r.status === 401) {
      throw new Error(`OpenAI authentication failed (401). Check OPENAI_API_KEY. Details: ${text}`);
    }
    if (r.status === 429) {
      throw new Error(`OpenAI rate limit (429). Try again shortly or upgrade limits. Details: ${text}`);
    }
    throw new Error(`OpenAI error (${r.status}). ${text}`);
  }

  const data = await r.json();
  const content = data?.choices?.[0]?.message?.content?.trim() || "";
  return content;
}

module.exports = async (req, res) => {
  try {
    if (req.method !== "POST") {
      res.setHeader("Allow", "POST");
      return res.status(405).json({ error: "Method not allowed" });
    }

    const apiKey = process.env.OPENAI_API_KEY;
    if (!apiKey) {
      return res.status(500).json({
        error: "Missing OPENAI_API_KEY",
        detail: "Set the OPENAI_API_KEY environment variable in Vercel Project → Settings → Environment Variables."
      });
    }

    const body = safeJson(req);
    const resume = (body.resume || "").trim();
    const jd = (body.jd || body.jobDesc || "").trim();
    const tone = (body.tone || "professional").toString().toLowerCase();
    const seniority = (body.seniority || "mid").toString().toLowerCase();
    const role = (body.role || "general").toString().toLowerCase();

    if (!resume || !jd) {
      return res.status(400).json({ error: "Missing resume or job description" });
    }

    const { system, user } = buildPrompt({ resume, jd, tone, seniority, role });
    const bulletsText = await callOpenAI({ apiKey, model: DEFAULT_MODEL, system, user });

    // Normalize: ensure one bullet per line, strip stray numbering/markers.
    const cleaned = bulletsText
      .split("\n")
      .map(l => l.trim())
      .filter(Boolean)
      .map(l => l.replace(/^[-•*\d.)\s]+/, "")) // strip any leading markers
      .join("\n");

    return res.status(200).json({ bullets: cleaned });
  } catch (err) {
    console.error("rewrite error:", err);
    return res.status(500).json({ error: "Server error in /api/rewrite", detail: String(err.message || err) });
  }
};