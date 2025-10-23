import express from "express";
import cors from "cors";
import multer from "multer";
import { v4 as uuidv4 } from "uuid";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();

// ---- CORS (required for Actions) ----
app.use(cors({ origin: "*", methods: ["GET", "POST", "OPTIONS"], allowedHeaders: ["Content-Type", "Authorization"] }));
app.options("*", (req, res) => res.sendStatus(200));

// ---- Body parsers ----
app.use(express.json({ limit: "50mb" }));

// ---- Storage for PDFs (disk) ----
const DATA_DIR = path.join(__dirname, "data");
if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR);

const upload = multer({
  storage: multer.diskStorage({
    destination: (req, file, cb) => cb(null, DATA_DIR),
    filename: (req, file, cb) => cb(null, `${uuidv4()}${path.extname(file.originalname || ".pdf")}`)
  }),
  limits: { fileSize: 50 * 1024 * 1024 } // 50MB
});

// ---- Health ----
app.get("/healthz", (req, res) => res.json({ ok: true }));

// ---- Upload (field MUST be "file") ----
app.post("/upload", upload.single("file"), (req, res) => {
  // allow a couple of common aliases just in case
  if (!req.file && req.files && (req.files.pdf || req.files.document)) {
    req.file = req.files.pdf || req.files.document;
  }
  if (!req.file) return res.status(400).json({ error: "file is required" });
  const id = path.basename(req.file.filename);
  return res.json({ fileId: id });
});

// ---- Edit (fake text edit; just clones file and returns new id) ----
// In your real app, read the source PDF by fileId, apply edits, save as new file.
app.post("/edit", async (req, res) => {
  const { fileId, operations } = req.body || {};
  if (!fileId || !Array.isArray(operations)) {
    return res.status(400).json({ error: "fileId and operations required" });
  }
  const src = path.join(DATA_DIR, fileId);
  if (!fs.existsSync(src)) return res.status(404).json({ error: "fileId not found" });
  const outId = `${uuidv4()}.pdf`;
  const dst = path.join(DATA_DIR, outId);
  fs.copyFileSync(src, dst); // stub: replace with real edit logic
  return res.json({ editedFileId: outId });
});

// ---- Download ----
app.get("/download/:fileId", (req, res) => {
  const p = path.join(DATA_DIR, req.params.fileId);
  if (!fs.existsSync(p)) return res.sendStatus(404);
  res.setHeader("Content-Type", "application/pdf");
  fs.createReadStream(p).pipe(res);
});

// ---- Start ----
const PORT = process.env.PORT || 3000;
app.listen(PORT, "0.0.0.0", () => {
  console.log(`PDF API listening on http://0.0.0.0:${PORT}`);
});
