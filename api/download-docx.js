// api/download-docx.js
// CommonJS + Vercel-friendly .docx generator using "docx"

const { Document, Packer, Paragraph, TextRun } = require("docx");

function normalizeBullets(input) {
  // Accept either an array of strings or a single string with newlines
  if (Array.isArray(input)) {
    return input
      .map(s => (s || "").toString().trim())
      .filter(Boolean);
  }
  return (input || "")
    .toString()
    .split("\n")
    .map(s => s.trim())
    .filter(Boolean);
}

module.exports = async (req, res) => {
  try {
    if (req.method !== "POST") {
      res.setHeader("Allow", "POST");
      return res.status(405).json({ error: "Method not allowed" });
    }

    // Be tolerant if body arrives as a string
    let body = req.body;
    if (typeof body === "string") {
      try { body = JSON.parse(body); } catch { body = {}; }
    } else if (!body) {
      body = {};
    }

    const title = (body.title || "AI Suggested Resume Bullets").toString().trim();
    const bullets = normalizeBullets(body.bullets || body.text || "");

    if (!bullets.length) {
      return res.status(400).json({ error: "No bullets to export" });
    }

    // Build the docx
    const titlePara = new Paragraph({
      children: [new TextRun({ text: title, bold: true, size: 28 })],
      spacing: { after: 200 }
    });

    const bulletParas = bullets.map(line =>
      new Paragraph({
        text: line.replace(/^[-•*\d.)\s]+/, ""), // strip any leading markers
        bullet: { level: 0 },
      })
    );

    const doc = new Document({
      sections: [{ children: [titlePara, ...bulletParas] }]
    });

    const buffer = await Packer.toBuffer(doc);

    // Send file with proper headers
    res.setHeader("Content-Type", "application/vnd.openxmlformats-officedocument.wordprocessingml.document");
    res.setHeader("Content-Disposition", 'attachment; filename="ai_resume_bullets.docx"');
    return res.status(200).send(Buffer.from(buffer));
  } catch (err) {
    console.error("download-docx error:", err);
    return res.status(500).json({ error: "Server error in /api/download-docx", detail: String(err.message || err) });
  }
};