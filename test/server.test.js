import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import ffmpegPath from 'ffmpeg-static';
import { createApp } from '../src/app.js';

const run = promisify(execFile);
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'precheck-srv-'));
const video = path.join(tmp, 'sample.mp4');
let server, base;

before(async () => {
  await run(ffmpegPath, [
    '-y', '-hide_banner', '-loglevel', 'error',
    '-f', 'lavfi', '-i', 'testsrc=size=320x240:rate=25:duration=2',
    '-pix_fmt', 'yuv420p', video,
  ]);
  const app = createApp({ dataDir: path.join(tmp, 'data') });
  server = app.listen(0);
  base = `http://127.0.0.1:${server.address().port}`;
});
after(() => server.close());

test('GET / serves the Vietnamese upload page', async () => {
  const res = await fetch(base + '/');
  assert.equal(res.status, 200);
  const html = await res.text();
  assert.match(html, /Still Frame/);
});

test('POST /api/check analyzes an uploaded video and returns sheet URLs that resolve', async () => {
  const fd = new FormData();
  fd.append('video', new Blob([fs.readFileSync(video)], { type: 'video/mp4' }), 'sample.mp4');
  const res = await fetch(base + '/api/check', { method: 'POST', body: fd });
  assert.equal(res.status, 200);
  const body = await res.json();
  assert.equal(body.verdict, 'PASS');
  assert.ok(Math.abs(body.duration - 2) < 0.2);
  assert.ok(body.sheets.length >= 1);
  const img = await fetch(base + body.sheets[0]);
  assert.equal(img.status, 200);
  assert.equal(img.headers.get('content-type'), 'image/jpeg');
});

test('POST /api/check without a file returns 400 with a Vietnamese message', async () => {
  const res = await fetch(base + '/api/check', { method: 'POST', body: new FormData() });
  assert.equal(res.status, 400);
  const body = await res.json();
  assert.match(body.error, /video/i);
});
