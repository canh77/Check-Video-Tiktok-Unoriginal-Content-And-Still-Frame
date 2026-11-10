import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseFreezeLog, summarize } from '../src/analyze.js';

const LOG = `
[freezedetect @ 0x1] lavfi.freezedetect.freeze_start: 1.5
[freezedetect @ 0x1] lavfi.freezedetect.freeze_duration: 2.2
[freezedetect @ 0x1] lavfi.freezedetect.freeze_end: 3.7
[freezedetect @ 0x1] lavfi.freezedetect.freeze_start: 8.25
`;

test('parseFreezeLog returns start/end pairs, closing an open segment at video end', () => {
  const segs = parseFreezeLog(LOG, 10);
  assert.deepEqual(segs, [
    { start: 1.5, end: 3.7 },
    { start: 8.25, end: 10 },
  ]);
});

test('parseFreezeLog returns empty array when nothing froze', () => {
  assert.deepEqual(parseFreezeLog('frame= 100 fps=0.0', 10), []);
});

test('summarize computes totals and PASS verdict when no freeze >= 1s and < 10%', () => {
  const s = summarize([{ start: 1, end: 1.6 }], 20);
  assert.equal(s.totalFrozen, 0.6);
  assert.equal(s.longest, 0.6);
  assert.equal(s.pct, 3);
  assert.equal(s.verdict, 'PASS');
});

test('summarize flags WARN when a freeze is between 1s and 2s', () => {
  const s = summarize([{ start: 0, end: 1.5 }], 30);
  assert.equal(s.verdict, 'WARN');
});

test('summarize flags WARN when total frozen >= 10% even if each freeze is short', () => {
  const s = summarize([{ start: 0, end: 0.9 }, { start: 5, end: 5.9 }], 15);
  assert.equal(s.verdict, 'WARN');
});

test('summarize flags FAIL when any freeze >= 2s', () => {
  const s = summarize([{ start: 3, end: 5 }], 60);
  assert.equal(s.verdict, 'FAIL');
});

test('summarize flags FAIL when more than 30% of video is frozen', () => {
  const s = summarize([{ start: 0, end: 1.9 }, { start: 2, end: 3.9 }], 10);
  assert.equal(s.verdict, 'FAIL');
});

test('summarize handles zero duration without dividing by zero', () => {
  const s = summarize([], 0);
  assert.equal(s.pct, 0);
  assert.equal(s.verdict, 'PASS');
});
