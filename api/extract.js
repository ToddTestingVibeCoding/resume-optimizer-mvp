// api/extract.js
const fs = require("fs");
const path = require("path");

// ✅ v3: pull the named export { formidable }
const { formidable } = require("formidable");

const mammoth = require("mammoth");
const pdfParse = require("pdf-parse");

module.exports = async (req, res) => {
  if (req.method !== "POST") {
    res.statusCode = 405;
    return res.json({ error: "Method Not Allowed" });
  }

  try {
    // ✅ v3: call the formidable() factory to get a form instance
    const form = formidable({
      multiples: true,            // always return arrays for files
      maxFileSize: 8 * 1024 * 1024, // 8MB
      keepExtensions: true,
    });

    // ✅ v3 promise API: returns { fields, files }
    const { fields, files } = await form.parse(req);

    // Try common field names, then fall back to first file
    let file =
      (files.file && (Array.isArray(files.file) ? files.file[0] : files.file)) ||
      (files.resume && (Array.isArray(files.resume) ? files.resume[0] : files.resume)) ||
      (files.upload && (Array.isArray(files.upload) ? files.upload[0] : files.upload)) ||
      (() => {
        const vals = Object.values(files || {});
        if (!vals.length) return null;
        return Array.isArray(vals[0]) ? vals[0][0] : vals[0];
      })();

    if (!file || !file.filepath) {
      res.statusCode = 400;
      return res.json({ error: "No file uploaded or unreadable payload" });
    }

    const filepath = file.filepath;
    const orig = file.originalFilename || file.newFilename || "";
    const ext = (path.extname(orig).toLowerCase()) || "";
    const mimetype = (file.mimetype || "").toLowerCase();

    let text = "";

    if (ext === ".docx" || mimetype.includes("wordprocessingml")) {
      const buffer = fs.readFileSync(filepath);
      const result = await mammoth.extractRawText({ buffer });
      text = (result && result.value) || "";
    } else if (ext === ".pdf" || mimetype.includes("pdf")) {
      const buffer = fs.readFileSync(filepath);
      const result = await pdfParse(buffer);
      text = (result && result.text) || "";
    } else if (ext === ".txt" || mimetype.startsWith("text/")) {
      text = fs.readFileSync(filepath, "utf8");
    } else {
      res.statusCode = 415;
      return res.json({ error: "Unsupported file type. Please upload .docx, .pdf, or .txt." });
    }

    text = String(text || "")
      .replace(/\r/g, "")
      .replace(/\t/g, " ")
      .replace(/[ \u00A0]+/g, " ")
      .trim();

    res.setHeader("Content-Type", "application/json");
    return res.status(200).send(JSON.stringify({ text }));
  } catch (err) {
    res.statusCode = 500;
    return res.json({ error: "Extraction failed", detail: String(err && err.message || err) });
  }
};