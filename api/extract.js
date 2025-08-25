// api/extract.js
// Callback-style formidable v3 + debug echo of parsed keys

const fs = require("fs");
const path = require("path");
const { formidable } = require("formidable");

function firstFileFrom(files) {
  if (!files) return null;
  if (files.file) return Array.isArray(files.file) ? files.file[0] : files.file;
  const keys = Object.keys(files);
  if (!keys.length) return null;
  const v = files[keys[0]];
  return Array.isArray(v) ? v[0] : v;
}

function getFilepath(fileObj) {
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
      debug: { contentType: ct }
    });
  }

  const form = formidable({
    multiples: false,
    keepExtensions: true,
    maxFileSize: 10 * 1024 * 1024, // 10 MB
  });

  form.parse(req, async (err, fields, files) => {
    const debug = {
      contentType: ct,
      fieldsKeys: Object.keys(fields || {}),
      filesKeys: Object.keys(files || {})
    };

    try {
      if (err) {
        res.statusCode = 500;
        return res.json({ error: "Extraction failed", detail: err.message, debug });
      }

      const fileObj = firstFileFrom(files);
      if (!fileObj) {
        res.statusCode = 400;
        return res.json({
          error: "No file uploaded",
          detail: "Could not find an uploaded file field. Try selecting a .docx, .pdf, or .txt via the Upload button.",
          debug
        });
      }

      const filepath = getFilepath(fileObj);
      if (!filepath) {
        res.statusCode = 500;
        return res.json({
          error: "Extraction failed",
          detail: "Temporary upload filepath missing.",
          debug: { ...debug, fileObjSeen: Object.keys(fileObj) }
        });
      }

      const buf = await fs.promises.readFile(filepath);
      const filename = fileObj.originalFilename || fileObj.newFilename || "upload";
      const ext = (path.extname(filename) || "").toLowerCase();

      let text = "";
      if (ext === ".txt") {
        text = buf.toString("utf8");
      } else if (ext === ".pdf") {
        text = await parsePDF(buf);
      } else if (ext === ".docx") {
        text = await parseDOCX(buf);
      } else {
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
          debug: { ...debug, filename }
        });
      }

      res.setHeader("Content-Type", "application/json");
      return res.end(JSON.stringify({ ok: true, text, debug: { ...debug, filename } }));
    } catch (e) {
      res.statusCode = 500;
      return res.json({ error: "Extraction failed", detail: e.message, debug });
    }
  });
};