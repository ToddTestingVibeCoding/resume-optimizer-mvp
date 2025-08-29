// api/download-text.js
import { NextResponse } from "next/server"; // Vercel Edge/Node compat (works in Node runtime)
import { Document, Packer, Paragraph } from "docx";

// Ensure Vercel uses Node runtime for this function
export const config = {
  runtime: "nodejs20.x"
};

export default async function handler(req, res) {
  try {
    if (req.method !== "POST") {
      res.status(405).json({ error: "Method not allowed" });
      return;
    }

    const chunks = [];
    for await (const chunk of req) chunks.push(chunk);
    const bodyStr = Buffer.concat(chunks).toString("utf8");
    const payload = JSON.parse(bodyStr || "{}");

    const title = (payload.title || "Resume Draft").toString();
    const text = (payload.text || "").toString();

    if (!text.trim()) {
      res.status(400).json({ error: "No text provided" });
      return;
    }

    const lines = text.split(/\r?\n/);
    const paragraphs = [];

    // Title
    paragraphs.push(
      new Paragraph({
        text: title,
        heading: "HEADING_1",
      })
    );

    paragraphs.push(new Paragraph({ text: "" })); // spacing

    // Body lines -> paragraphs (blank lines = spacing)
    for (const line of lines) {
      const t = line.trim();
      paragraphs.push(new Paragraph({ text: t }));
    }

    const doc = new Document({
      sections: [{ properties: {}, children: paragraphs }]
    });

    const buffer = await Packer.toBuffer(doc);

    res.setHeader("Content-Type", "application/vnd.openxmlformats-officedocument.wordprocessingml.document");
    res.setHeader("Content-Disposition", `attachment; filename="resume_draft.docx"`);
    res.status(200).send(buffer);
  } catch (err) {
    res.status(500).json({ error: "DOCX build failed", detail: String(err?.message || err) });
  }
}