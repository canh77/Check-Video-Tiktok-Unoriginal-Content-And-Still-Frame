import { test, before } from 'node:test';
import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import ffmpegPath from 'ffmpeg-static';
import { analyzeVideo } from '../src/analyze.js';

const run = promisify(execFile);
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'precheck-'));
const video = path.join(tmp, 'sample.mp4');

before(async () => {
  // 3s of moving test pattern followed by 3s of a static blue frame
  await run(ffmpegPath, [
    '-y', '-hide_banner', '-loglevel', 'error',
    '-f', 'lavfi', '-i', 'testsrc=size=320x240:rate=25:duration=3',
    '-f', 'lavfi', '-i', 'color=c=blue:size=320x240:rate=25:duration=3',
    '-filter_complex', '[0:v][1:v]concat=n=2:v=1:a=0[v]',
    '-map', '[v]', '-pix_fmt', 'yuv420p', video,
  ]);
});

test('analyzeVideo finds the static tail and fails the video', async () => {
  const outDir = path.join(tmp, 'out');
  const r = await analyzeVideo(video, outDir);
  assert.ok(Math.abs(r.duration - 6) < 0.2, `duration ${r.duration}`);
  assert.equal(r.segments.length, 1);
  assert.ok(Math.abs(r.segments[0].start - 3) < 0.3, `start ${r.segments[0].start}`);
  assert.ok(Math.abs(r.segments[0].end - 6) < 0.3, `end ${r.segments[0].end}`);
  assert.equal(r.verdict, 'FAIL');
  assert.ok(r.sheets.length >= 1);
  for (const s of r.sheets) assert.ok(fs.existsSync(path.join(outDir, s)), `missing ${s}`);
});
