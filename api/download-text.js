// api/download-text.js
// Simple Node.js serverless function that returns plain text as a download

function safeFilename(name = "draft_resume.txt") {
  // strip path-like chars just in case
  return String(name).replace(/[\/\\<>:"|?*\x00-\x1F]/g, "").slice(0, 120) || "draft_resume.txt";
}

module.exports = async (req, res) => {
  if (req.method !== "POST") {
    res.setHeader("Allow", "POST");
    return res.status(405).json({ error: "Method Not Allowed" });
  }

  try {
    const { filename = "draft_resume.txt", text = "" } = req.body || {};
    const finalName = safeFilename(filename);

    res.setHeader("Content-Type", "text/plain; charset=utf-8");
    res.setHeader("Content-Disposition", `attachment; filename="${finalName}"`);
    return res.status(200).send(text || "");
  } catch (err) {
    return res.status(500).json({
      error: "Download failed",
      detail: err?.message || String(err),
    });
  }
};

// IMPORTANT: Vercel supports "nodejs", not "nodejs20.x"
module.exports.config = { runtime: "nodejs" };