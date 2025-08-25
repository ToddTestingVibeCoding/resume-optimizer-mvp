/* Commit: feat(api): add file text extraction for resume upload */
import formidable from "formidable";
import fs from "fs/promises";
import mammoth from "mammoth";
import pdfParse from "pdf-parse";

export const config = {
  api: { bodyParser: false }, // let formidable handle multipart
};

export default async function handler(req, res) {
  if (req.method !== "POST") {
    res.status(405).json({ error: "Method not allowed" });
    return;
  }

  const form = formidable({ multiples: false });

  form.parse(req, async (err, fields, files) => {
    if (err) {
      res.status(500).json({ error: "Upload failed" });
      return;
    }

    try {
      const file = files.file;
      const buffer = await fs.readFile(file.filepath);

      let text = "";
      if (file.originalFilename.endsWith(".docx")) {
        const result = await mammoth.extractRawText({ buffer });
        text = result.value;
      } else if (file.originalFilename.endsWith(".pdf")) {
        const result = await pdfParse(buffer);
        text = result.text;
      } else {
        text = buffer.toString("utf8");
      }

      res.status(200).json({ text });
    } catch (e) {
      res.status(500).json({ error: "Extraction failed", detail: e.message });
    }
  });
}
