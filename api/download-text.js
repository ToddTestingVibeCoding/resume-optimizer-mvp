// /api/download-text.js
// POST { title, text } -> .txt file download

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

module.exports = async (req, res) => {
  try {
    if (req.method !== "POST") { res.status(405).json({ error: "Method not allowed" }); return; }

    const { title, text } = await readJson(req);
    if (!text || !String(text).trim()) {
      res.status(400).json({ error: "No text provided" }); return;
    }
    const filename = `${(title || "Draft Resume").toString().replace(/[^\w.-]+/g, "_").slice(0, 64)}.txt`;

    res.setHeader("Content-Type", "text/plain; charset=utf-8");
    res.setHeader("Content-Disposition", `attachment; filename="${filename}"`);
    res.status(200).send(String(text));
  } catch (err) {
    console.error("download-text error:", err);
    res.status(500).json({ error: "Server error", detail: err?.message || String(err) });
  }
};

module.exports.config = { runtime: "nodejs" };