// /api/rewrite.js
// POST { resume, jd } -> { bullets: string[] }
// Uses OpenAI via env: OPENAI_API_KEY (and optional OPENAI_MODEL)

const DEFAULT_MODEL = process.env.OPENAI_MODEL || "gpt-4o-mini";

async function readJson(req) {
  let body = "";
  await new Promise((resolve, reject) => {
    req.on("data", (c) => (body += c));
    req.on("end", resolve);
    req.on("error", reject);
  });
  try { return JSON.parse(body || "{}"); }
  catch { return {}; }
}

function cleanBullets(raw) {
  if (!raw) return [];
  // If already array, flatten to strings
  if (Array.isArray(raw)) {
    return raw.map(String).map((s) => s.replace(/^[-•*\d.)\s]+/, "").trim()).filter(Boolean);
  }
  // Try JSON parse (model might return as a JSON string)
  try {
    const maybe = JSON.parse(raw);
    if (Array.isArray(maybe)) {
      return maybe.map(String).map((s) => s.replace(/^[-•*\d.)\s]+/, "").trim()).filter(Boolean);
    }
    if (maybe && Array.isArray(maybe.bullets)) {
      return maybe.bullets.map(String).map((s) => s.replace(/^[-•*\d.)\s]+/, "").trim()).filter(Boolean);
    }
  } catch (_) {}
  // Fallback: split lines
  return String(raw)
    .split("\n")
    .map((l) => l.trim())
    .map((l) => l.replace(/^[-•*\d.)\s]+/, ""))
    .filter(Boolean);
}

async function callOpenAI(messages, temperature = 0.5) {
  const key = process.env.OPENAI_API_KEY;
  if (!key) throw new Error("Missing OPENAI_API_KEY");
  const ctrl = new AbortController();
  const to = setTimeout(() => ctrl.abort(), 60_000);
  try {
    const r = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${key}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: DEFAULT_MODEL,
        messages,
        temperature,
        response_format: { type: "json_object" }
      }),
      signal: ctrl.signal
    });
    if (!r.ok) throw new Error(await r.text());
    const data = await r.json();
    const msg = data.choices?.[0]?.message?.content || "{}";
    return msg;
  } finally {
    clearTimeout(to);
  }
}

module.exports = async (req, res) => {
  try {
    if (req.method !== "POST") { res.status(405).json({ error: "Method not allowed" }); return; }

    const { resume, jd } = await readJson(req);
    if (!resume || !jd) {
      res.status(400).json({ error: "Missing resume or job description" });
      return;
    }

    const sys = {
      role: "system",
      content: "You rewrite resumes into quantified, impact-focused bullets aligned to a given job description. Respond ONLY with JSON: {\"bullets\": string[]}. Do not include markdown fences."
    };
    const user = {
      role: "user",
      content:
        `Rewrite the resume bullets to align with the job description.\n\n` +
        `Resume:\n${resume}\n\n` +
        `Job Description:\n${jd}\n\n` +
        `Return JSON { "bullets": [6-12 concise bullets] }.`
    };

    const rawJson = await callOpenAI([sys, user], 0.5);

    // Parse the JSON the model returned
    let parsed;
    try { parsed = JSON.parse(rawJson); } catch { parsed = {}; }
    let bullets = cleanBullets(parsed?.bullets || rawJson);

    if (!bullets.length) {
      throw new Error("Model returned no bullets.");
    }

    res.status(200).json({ bullets });
  } catch (err) {
    console.error("rewrite error:", err);
    res.status(500).json({ error: "Server error", detail: err?.message || String(err) });
  }
};

module.exports.config = { runtime: "nodejs" };