// /api/download-docx.js
// POST { title, bullets } -> DOCX file
// Requires dependency: docx

const { Document, Packer, Paragraph, TextRun } = require("docx");

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

    const { title, bullets } = await readJson(req);
    if (!bullets || (!Array.isArray(bullets) && typeof bullets !== "string")) {
      res.status(400).json({ error: "Invalid bullets payload" }); return;
    }
    const bulletList = Array.isArray(bullets)
      ? bullets
      : String(bullets).split("\n").map((s) => s.replace(/^[-•*\d.)\s]+/, "").trim()).filter(Boolean);

    const doc = new Document({
      sections: [
        {
          properties: {},
          children: [
            new Paragraph({
              children: [ new TextRun({ text: title || "AI Suggested Resume Bullets", bold: true, size: 28 }) ],
              spacing: { after: 300 }
            }),
            ...bulletList.map((b) =>
              new Paragraph({
                text: b,
                bullet: { level: 0 },
                spacing: { after: 120 }
              })
            )
          ]
        }
      ]
    });

    const buffer = await Packer.toBuffer(doc);
    const filename = `${(title || "ai_resume_bullets").replace(/[^\w.-]+/g, "_").slice(0, 64)}.docx`;

    res.setHeader("Content-Type", "application/vnd.openxmlformats-officedocument.wordprocessingml.document");
    res.setHeader("Content-Disposition", `attachment; filename="${filename}"`);
    res.status(200).send(buffer);
  } catch (err) {
    console.error("download-docx error:", err);
    res.status(500).json({ error: "DOCX export failed", detail: err?.message || String(err) });
  }
};

module.exports.config = { runtime: "nodejs" };