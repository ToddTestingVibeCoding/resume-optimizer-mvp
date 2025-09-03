// /api/extract.js
// Multipart upload -> { text } from .docx | .pdf | .txt
// Requires dependencies: formidable, mammoth, pdf-parse

const fs = require("fs");
const path = require("path");
const os = require("os");

let formidableLib; // dynamic to handle CJS/ESM variations
async function getFormidable() {
  if (formidableLib) return formidableLib;
  try {
    // CJS default export v2/v3
    formidableLib = require("formidable");
  } catch (_) {
    // ESM fallback
    const m = await import("formidable");
    formidableLib = m.default || m.formidable || m;
  }
  return formidableLib;
}

function createForm(formidable) {
  // Support different export shapes across versions
  if (typeof formidable === "function") {
    return formidable({ multiples: false, keepExtensions: true, uploadDir: os.tmpdir() });
  }
  if (typeof formidable.formidable === "function") {
    return formidable.formidable({ multiples: false, keepExtensions: true, uploadDir: os.tmpdir() });
  }
  if (typeof formidable.IncomingForm === "function") {
    return new formidable.IncomingForm({ multiples: false, keepExtensions: true, uploadDir: os.tmpdir() });
  }
  throw new Error("Unsupported formidable export shape");
}

async function parseForm(req) {
  const formidable = await getFormidable();
  const form = createForm(formidable);
  return await new Promise((resolve, reject) => {
    form.parse(req, (err, fields, files) => {
      if (err) return reject(err);
      resolve({ fields, files });
    });
  });
}

async function extractText(file) {
  const filepath = file?.filepath || file?.path;
  const orig = file?.originalFilename || file?.name || "";
  if (!filepath) throw new Error("No uploaded file path");
  const ext = path.extname(orig || filepath).toLowerCase();

  if (ext === ".docx") {
    const mammoth = require("mammoth");
    const r = await mammoth.extractRawText({ path: filepath });
    return (r.value || "").trim();
  }

  if (ext === ".pdf") {
    const pdfParse = require("pdf-parse");
    const buf = fs.readFileSync(filepath);
    const r = await pdfParse(buf);
    return (r.text || "").trim();
  }

  // fallback: treat as plain text
  const txt = fs.readFileSync(filepath, "utf8");
  return (txt || "").trim();
}

module.exports = async (req, res) => {
  try {
    if (req.method !== "POST") { res.status(405).json({ error: "Method not allowed" }); return; }

    const { files } = await parseForm(req);

    // Find the uploaded file; accept various keys
    const candidates = ["file", "resume", "upload"];
    let f;
    for (const key of candidates) {
      const v = files?.[key];
      if (!v) continue;
      f = Array.isArray(v) ? v[0] : v;
      if (f) break;
    }
    if (!f) { res.status(400).json({ error: "No file uploaded" }); return; }

    const text = await extractText(f);
    if (!text) { res.status(400).json({ error: "Could not extract text" }); return; }

    res.status(200).json({ text });
  } catch (err) {
    console.error("extract error:", err);
    res.status(500).json({ error: "Extraction failed", detail: err?.message || String(err) });
  }
};

module.exports.config = { runtime: "nodejs" };