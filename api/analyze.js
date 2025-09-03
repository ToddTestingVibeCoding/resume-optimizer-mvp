// /api/analyze.js
// POST { resume, jobDesc } -> { analysis: string, topTerms: string[], missingTerms: string[], suggestions: string[] }

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

async function callOpenAI(messages, temperature = 0.2) {
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

function asArray(x) {
  if (!x) return [];
  if (Array.isArray(x)) return x.map(String).filter(Boolean);
  try {
    const y = JSON.parse(String(x));
    if (Array.isArray(y)) return y.map(String).filter(Boolean);
    if (y && Array.isArray(y.terms)) return y.terms.map(String).filter(Boolean);
  } catch (_) {}
  return String(x).split(/\n|,|;/).map((s) => s.trim()).filter(Boolean);
}

module.exports = async (req, res) => {
  try {
    if (req.method !== "POST") { res.status(405).json({ error: "Method not allowed" }); return; }

    const { resume, jobDesc } = await readJson(req);
    if (!resume || !jobDesc) {
      res.status(400).json({ error: "Missing resume or job description" });
      return;
    }

    const sys = {
      role: "system",
      content:
        "Analyze alignment between a resume and a job description. Respond ONLY with JSON of shape: " +
        "{ \"analysis\": string, \"topTerms\": string[], \"missingTerms\": string[], \"suggestions\": string[] }. No markdown."
    };
    const user = {
      role: "user",
      content:
        `Resume:\n${resume}\n\n` +
        `Job Description:\n${jobDesc}\n\n` +
        `Return JSON with those four fields. Keep analysis concise (<= 150 words).`
    };

    const raw = await callOpenAI([sys, user], 0.2);
    let parsed;
    try { parsed = JSON.parse(raw); } catch { parsed = {}; }

    const analysis = (parsed.analysis || "").toString();
    const topTerms = asArray(parsed.topTerms);
    const missingTerms = asArray(parsed.missingTerms);
    const suggestions = asArray(parsed.suggestions);

    res.status(200).json({
      analysis,
      topTerms,
      missingTerms,
      suggestions
    });
  } catch (err) {
    console.error("analyze error:", err);
    res.status(500).json({ error: "Server error", detail: err?.message || String(err) });
  }
};

module.exports.config = { runtime: "nodejs" };