// api/extract.js
// Vercel-friendly formidable v3 handler (callback style) + .docx/.pdf/.txt support

const fs = require("fs");
const path = require("path");
const { formidable } = require("formidable"); // v3 style import

function firstFileFrom(files) {
  if (!files) return null;
  // Try "file" key first (what our client sends)
  if (files.file) return Array.isArray(files.file) ? files.file[0] : files.file;
  // Otherwise pick the first key
  const keys = Object.keys(files);
  if (!keys.length) return null;
  const v = files[keys[0]];
  return Array.isArray(v) ? v[0] : v;
}

function getFilepath(fileObj) {
  // formidable v3 puts temp path on .filepath
  return fileObj?.filepath || fileObj?.path || null;
}

async function parsePDF(buf) {
  const pdfParse = require("pdf-parse");
  const out = await pdfParse(buf);
  return (out.text || "").trim();
}

async function parseDOCX(buf) {
  const mammoth = require("mammoth");
  const out = await mammoth.extractRawText({ buffer: buf });
  return (out.value || "").trim();
}

module.exports = (req, res) => {
  const ct = (req.headers["content-type"] || "").toLowerCase();
  if (!ct.includes("multipart/form-data")) {
    res.statusCode = 400;
    return res.json({
      error: "Bad request",
      detail: `Expected multipart/form-data (got "${ct || "none"}"). Use the Upload button.`,
    });
  }

  const form = formidable({
    multiples: false,
    keepExtensions: true,
    maxFileSize: 10 * 1024 * 1024, // 10 MB
  });

  form.parse(req, async (err, fields, files) => {
    try {
      if (err) {
        console.error("extract parse error:", err);
        res.statusCode = 500;
        return res.json({ error: "Extraction failed", detail: err.message });
      }

      console.log("extract: fields keys ->", Object.keys(fields || {}));
      console.log("extract: files keys  ->", Object.keys(files || {}));

      const fileObj = firstFileFrom(files);
      if (!fileObj) {
        res.statusCode = 400;
        return res.json({
          error: "No file uploaded",
          detail:
            "Could not find an uploaded file field. Try selecting a .docx, .pdf, or .txt via the Upload button.",
        });
      }

      const filepath = getFilepath(fileObj);
      if (!filepath) {
        res.statusCode = 500;
        return res.json({
          error: "Extraction failed",
          detail: "Temporary upload filepath missing.",
        });
      }

      const buf = await fs.promises.readFile(filepath);
      const filename =
        fileObj.originalFilename || fileObj.newFilename || "upload";
      const ext = (path.extname(filename) || "").toLowerCase();

      let text = "";
      if (ext === ".txt") {
        text = buf.toString("utf8");
      } else if (ext === ".pdf") {
        text = await parsePDF(buf);
      } else if (ext === ".docx") {
        text = await parseDOCX(buf);
      } else {
        // Fallback: sniff magic bytes for PDF, then try DOCX, else utf8
        const head = buf.slice(0, 4).toString("hex");
        if (head.startsWith("25504446")) text = await parsePDF(buf);
        else {
          try { text = await parseDOCX(buf); }
          catch { text = buf.toString("utf8"); }
        }
      }

      if (!text) {
        res.statusCode = 422;
        return res.json({
          error: "Extraction failed",
          detail: "We couldn’t extract any text. Try a simpler .docx/.pdf or a .txt file.",
        });
      }

      res.setHeader("Content-Type", "application/json");
      return res.end(JSON.stringify({ ok: true, text }));
    } catch (e) {
      console.error("extract fatal:", e);
      res.statusCode = 500;
      return res.json({ error: "Extraction failed", detail: e.message });
    }
  });
};