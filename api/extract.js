// api/extract.js
const fs = require("fs");
const path = require("path");
const { formidable } = require("formidable");
const mammoth = require("mammoth");
const pdfParse = require("pdf-parse");

module.exports = async (req, res) => {
  if (req.method !== "POST") {
    res.statusCode = 405;
    return res.json({ error: "Method Not Allowed" });
  }

  // Guard: must be multipart/form-data
  const ct = (req.headers["content-type"] || "").toLowerCase();
  if (!ct.includes("multipart/form-data")) {
    res.statusCode = 400;
    return res.json({
      error: "Bad request",
      detail:
        "Expected multipart/form-data. Please use the Upload button (do not set Content-Type manually).",
    });
  }

  try {
    const form = formidable({
      multiples: true,
      maxFileSize: 8 * 1024 * 1024,
      keepExtensions: true,
    });

    const { fields, files } = await form.parse(req);

    // Fully safe selection with optional chaining (no direct files.file)
    const pickFirst = (v) => (Array.isArray(v) ? v[0] : v);
    let file =
      pickFirst(files?.file) ??
      pickFirst(files?.resume) ??
      pickFirst(files?.upload) ??
      (() => {
        const vals = Object.values(files || {});
        return vals.length ? pickFirst(vals[0]) : null;
      })();

    if (!file || !file.filepath) {
      res.statusCode = 400;
      return res.json({
        error: "No file uploaded",
        detail:
          "Could not find an uploaded file field. Try selecting a .docx, .pdf, or .txt via the Upload button.",
      });
    }

    const filepath = file.filepath;
    const orig = file.originalFilename || file.newFilename || "";
    const ext = (path.extname(orig).toLowerCase()) || "";
    const mimetype = (file.mimetype || "").toLowerCase();

    let text = "";

    if (ext === ".docx" || mimetype.includes("wordprocessingml")) {
      const buffer = fs.readFileSync(filepath);
      const result = await mammoth.extractRawText({ buffer });
      text = result?.value || "";
    } else if (ext === ".pdf" || mimetype.includes("pdf")) {
      const buffer = fs.readFileSync(filepath);
      const result = await pdfParse(buffer);
      text = result?.text || "";
    } else if (ext === ".txt" || mimetype.startsWith("text/")) {
      text = fs.readFileSync(filepath, "utf8");
    } else {
      res.statusCode = 415;
      return res.json({
        error: "Unsupported file type. Please upload .docx, .pdf, or .txt.",
      });
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
    return res.json({
      error: "Extraction failed",
      detail: String((err && err.message) || err),
    });
  }
};