// /api/download-docx.js
// CommonJS style to avoid ESM config headaches.
const { Document, Packer, Paragraph, TextRun } = require("docx");

module.exports = async (req, res) => {
  if (req.method !== "POST") {
    res.status(405).json({ error: "Method not allowed" });
    return;
  }

  try {
    const { bullets = [], title = "AI Suggested Resume Bullets" } = req.body || {};
    if (!Array.isArray(bullets) || bullets.length === 0) {
      res.status(400).json({ error: "No bullets provided" });
      return;
    }

    // Build a simple.docx with a title and bullet list
    const doc = new Document({
      sections: [
        {
          properties: {},
          children: [
            new Paragraph({
              children: [
                new TextRun({ text: title, bold: true, size: 28 }) // ~14pt
              ],
              spacing: { after: 200 }
            }),
            ...bullets.map((b) =>
              new Paragraph({
                text: b,
                bullet: { level: 0 }
              })
            )
          ]
        }
      ]
    });

    const buffer = await Packer.toBuffer(doc);

    res.setHeader(
      "Content-Type",
      "application/vnd.openxmlformats-officedocument.wordprocessingml.document"
    );
    res.setHeader(
      "Content-Disposition",
      'attachment; filename="ai_resume_bullets.docx"'
    );
    res.status(200).send(Buffer.from(buffer));
  } catch (err) {
    res.status(500).json({ error: err.message || "Failed to generate DOCX" });
  }
};
