// Pure analysis helpers: parse ffmpeg freezedetect output and score the result.
// Thresholds are judgment calls, not published TikTok rules (see README).

export function parseFreezeLog(logText, duration) {
  const segments = [];
  for (const line of String(logText).split(/\r?\n/)) {
    let m = line.match(/freeze_start:\s*([\d.]+)/);
    if (m) {
      segments.push({ start: parseFloat(m[1]), end: null });
      continue;
    }
    m = line.match(/freeze_end:\s*([\d.]+)/);
    if (m && segments.length && segments[segments.length - 1].end === null) {
      segments[segments.length - 1].end = parseFloat(m[1]);
    }
  }
  for (const s of segments) if (s.end === null) s.end = duration;
  return segments;
}

export function summarize(segments, duration) {
  let totalFrozen = 0;
  let longest = 0;
  for (const s of segments) {
    const len = s.end - s.start;
    totalFrozen += len;
    if (len > longest) longest = len;
  }
  const pct = duration > 0 ? (100 * totalFrozen) / duration : 0;
  let verdict = 'PASS';
  if (longest >= 2 || pct > 30) verdict = 'FAIL';
  else if (longest >= 1 || pct >= 10) verdict = 'WARN';
  const r = (n) => Math.round(n * 100) / 100;
  return {
    totalFrozen: r(totalFrozen),
    longest: r(longest),
    pct: Math.round(pct * 10) / 10,
    verdict,
  };
}

// ---------------------------------------------------------------------------
// ffmpeg runner
// ---------------------------------------------------------------------------
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import fs from 'node:fs';
import path from 'node:path';
import ffmpegStatic from 'ffmpeg-static';
import ffprobeStatic from 'ffprobe-static';

const execFileP = promisify(execFile);
const FFMPEG = process.env.FFMPEG_PATH || ffmpegStatic;
const FFPROBE = process.env.FFPROBE_PATH || ffprobeStatic.path;
const MAX_BUFFER = 64 * 1024 * 1024;

function findFont() {
  if (process.env.FONT_PATH) return process.env.FONT_PATH;
  const candidates = [
    'C:/Windows/Fonts/arial.ttf',
    '/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf',
    '/usr/share/fonts/dejavu/DejaVuSans.ttf',
    '/System/Library/Fonts/Supplemental/Arial.ttf',
  ];
  return candidates.find((f) => fs.existsSync(f)) || null;
}

async function probeDuration(video) {
  const { stdout } = await execFileP(FFPROBE, [
    '-v', 'error', '-show_entries', 'format=duration', '-of', 'csv=p=0', video,
  ]);
  const d = parseFloat(String(stdout).trim());
  if (!Number.isFinite(d)) throw new Error('Không đọc được thời lượng video (ffprobe)');
  return d;
}

async function detectFreezes(video, { minFreeze, noise }) {
  // freezedetect reports via stderr metadata lines
  const { stderr } = await execFileP(FFMPEG, [
    '-hide_banner', '-nostats', '-i', video,
    '-vf', `freezedetect=n=${noise}:d=${minFreeze}`,
    '-map', '0:v:0', '-an', '-f', 'null', '-',
  ], { maxBuffer: MAX_BUFFER });
  return String(stderr);
}

async function makeSheets(video, outDir, duration, { perSheet = 12, maxSheets = 9 } = {}) {
  const fps = Math.min(2, (perSheet * maxSheets) / Math.max(duration, 0.1));
  const base = `fps=${fps.toFixed(3)},scale=320:-2`;
  const tile = 'tile=4x3';
  const pattern = path.join(outDir, 'sheet_%02d.jpg');
  const font = findFont();
  const filters = [];
  if (font) {
    // ffmpeg filter syntax: backslash-escape ':' inside option values
    const fontArg = font.replace(/\\/g, '/').replace(/:/g, '\\:');
    filters.push(`${base},drawtext=fontfile='${fontArg}':text='%{pts\\:hms}':x=6:y=6:fontsize=22:fontcolor=white:box=1:boxcolor=black@0.6,${tile}`);
  }
  filters.push(`${base},${tile}`); // fallback without timestamps
  let lastErr;
  for (const vf of filters) {
    try {
      await execFileP(FFMPEG, [
        '-hide_banner', '-nostats', '-loglevel', 'error', '-y', '-i', video,
        '-vf', vf, '-frames:v', String(maxSheets), '-q:v', '3', pattern,
      ], { maxBuffer: MAX_BUFFER });
      return fs.readdirSync(outDir).filter((f) => /^sheet_\d+\.jpg$/.test(f)).sort();
    } catch (e) {
      lastErr = e;
    }
  }
  throw lastErr;
}

/**
 * Analyze a video for still-frame segments.
 * @returns {{duration, segments, totalFrozen, longest, pct, verdict, sheets}}
 */
export async function analyzeVideo(video, outDir, { minFreeze = 0.5, noise = '-50dB' } = {}) {
  fs.mkdirSync(outDir, { recursive: true });
  const duration = await probeDuration(video);
  const log = await detectFreezes(video, { minFreeze, noise });
  const segments = parseFreezeLog(log, duration).map((s) => ({
    start: Math.round(s.start * 100) / 100,
    end: Math.round(s.end * 100) / 100,
  }));
  const summary = summarize(segments, duration);
  const sheets = await makeSheets(video, outDir, duration);
  return { duration: Math.round(duration * 100) / 100, segments, ...summary, sheets, minFreeze, noise };
}
