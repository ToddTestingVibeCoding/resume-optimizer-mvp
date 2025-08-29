// api/download-docx-draft.js
const { Document, Packer, Paragraph } = require("docx");

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

    // Split text into paragraphs by blank lines / newlines
    const paras = text.split(/\n{2,}|\r?\n/).map(t => t.trim()).filter(Boolean);

    const doc = new Document({
      sections: [{
        properties: {},
        children: paras.map(p => new Paragraph(p)),
      }],
    });

    const buffer = await Packer.toBuffer(doc);
    const filename = `${title.replace(/[^\w.-]+/g, "_").slice(0, 64)}.docx`;

    res.setHeader("Content-Type",
      "application/vnd.openxmlformats-officedocument.wordprocessingml.document"
    );
    res.setHeader("Content-Disposition", `attachment; filename="${filename}"`);
    res.status(200).send(Buffer.from(buffer));
  } catch (err) {
    console.error("download-docx-draft error:", err);
    res.status(500).json({ error: "Server error", detail: err?.message || String(err) });
  }
};

module.exports.config = {
  runtime: "nodejs", // important on Vercel
  regions: ["iad1", "sfo1", "dub1"],
};