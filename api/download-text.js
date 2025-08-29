// api/download-text.js
// Creates a plain .txt file from posted JSON { title, text }

module.exports = async (req, res) => {
  try {
    if (req.method !== "POST") {
      res.status(405).json({ error: "Method not allowed" });
      return;
    }

    let body = "";
    await new Promise((resolve, reject) => {
      req.on("data", (chunk) => (body += chunk));
      req.on("end", resolve);
      req.on("error", reject);
    });

    let payload = {};
    try {
      payload = JSON.parse(body || "{}");
    } catch (e) {
      res.status(400).json({ error: "Invalid JSON" });
      return;
    }

    const title = (payload.title || "Draft Resume").toString();
    const text = (payload.text || "").toString();

    if (!text.trim()) {
      res.status(400).json({ error: "No text provided" });
      return;
    }

    const filename = `${title.replace(/[^\w.-]+/g, "_").slice(0, 64)}.txt`;

    res.setHeader("Content-Type", "text/plain; charset=utf-8");
    res.setHeader("Content-Disposition", `attachment; filename="${filename}"`);
    res.status(200).send(text);
  } catch (err) {
    console.error("download-text error:", err);
    res.status(500).json({
      error: "Server error",
      detail: err?.message || String(err),
    });
  }
};

// IMPORTANT for Vercel:
// Use "nodejs" (no version string) to avoid the runtime error you saw.
module.exports.config = {
  runtime: "nodejs",
  regions: ["iad1", "sfo1", "dub1"], // optional: pick regions close to you
};