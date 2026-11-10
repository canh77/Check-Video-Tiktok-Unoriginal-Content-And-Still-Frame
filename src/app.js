import express from 'express';
import multer from 'multer';
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { analyzeVideo } from './analyze.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PUBLIC_DIR = path.join(__dirname, '..', 'public');

const VIDEO_EXT = new Set(['.mp4', '.mov', '.m4v', '.webm', '.mkv', '.avi', '.3gp']);

/** Tiny semaphore so a burst of uploads doesn't spawn unbounded ffmpeg processes. */
function createLimiter(max) {
  let active = 0;
  const queue = [];
  const next = () => {
    if (active >= max || queue.length === 0) return;
    active++;
    const { fn, resolve, reject } = queue.shift();
    fn().then(resolve, reject).finally(() => { active--; next(); });
  };
  return (fn) => new Promise((resolve, reject) => { queue.push({ fn, resolve, reject }); next(); });
}

export function createApp({
  dataDir = path.join(process.cwd(), 'data'),
  maxUploadMB = Number(process.env.MAX_UPLOAD_MB || 500),
  resultTtlMs = Number(process.env.RESULT_TTL_MINUTES || 60) * 60 * 1000,
  concurrency = Number(process.env.CONCURRENCY || 2),
} = {}) {
  const uploadDir = path.join(dataDir, 'uploads');
  const jobsDir = path.join(dataDir, 'jobs');
  fs.mkdirSync(uploadDir, { recursive: true });
  fs.mkdirSync(jobsDir, { recursive: true });

  const limit = createLimiter(concurrency);
  const upload = multer({
    storage: multer.diskStorage({
      destination: uploadDir,
      filename: (_req, file, cb) => cb(null, crypto.randomUUID() + path.extname(file.originalname).toLowerCase()),
    }),
    limits: { fileSize: maxUploadMB * 1024 * 1024, files: 1 },
    fileFilter: (_req, file, cb) => {
      const ext = path.extname(file.originalname).toLowerCase();
      if (file.mimetype.startsWith('video/') || VIDEO_EXT.has(ext)) return cb(null, true);
      cb(new Error('File không phải video. Hỗ trợ: mp4, mov, m4v, webm, mkv, avi, 3gp'));
    },
  });

  const app = express();
  app.disable('x-powered-by');
  app.use(express.static(PUBLIC_DIR));

  app.get('/api/health', (_req, res) => res.json({ ok: true }));

  app.post('/api/check', upload.single('video'), async (req, res) => {
    if (!req.file) return res.status(400).json({ error: 'Chưa chọn file video.' });
    const id = crypto.randomUUID();
    const outDir = path.join(jobsDir, id);
    const videoPath = req.file.path;
    try {
      const result = await limit(() => analyzeVideo(videoPath, outDir));
      setTimeout(() => fs.rm(outDir, { recursive: true, force: true }, () => {}), resultTtlMs).unref();
      res.json({
        id,
        fileName: req.file.originalname,
        fileSize: req.file.size,
        ...result,
        sheets: result.sheets.map((f) => `/results/${id}/${f}`),
      });
    } catch (e) {
      fs.rm(outDir, { recursive: true, force: true }, () => {});
      res.status(500).json({ error: 'Không phân tích được video: ' + (e.message || e) });
    } finally {
      fs.rm(videoPath, { force: true }, () => {});
    }
  });

  app.get('/results/:id/:file', (req, res) => {
    const { id, file } = req.params;
    if (!/^[0-9a-f-]{36}$/.test(id) || !/^sheet_\d+\.jpg$/.test(file)) return res.status(404).end();
    res.sendFile(path.join(jobsDir, id, file), (err) => { if (err) res.status(404).end(); });
  });

  // Error handler: multer / fileFilter errors become 400 JSON
  // eslint-disable-next-line no-unused-vars
  app.use((err, _req, res, _next) => {
    if (err instanceof multer.MulterError) {
      const msg = err.code === 'LIMIT_FILE_SIZE' ? `File quá lớn (tối đa ${maxUploadMB}MB).` : err.message;
      return res.status(400).json({ error: msg });
    }
    res.status(400).json({ error: err.message || 'Yêu cầu không hợp lệ' });
  });

  return app;
}
