const test = require('node:test');
const assert = require('node:assert/strict');
const { Media_videoExt, Media_videoProblem } = require('../gas/core/Media.js');

// 00 00 00 20 "ftyp" "isom" ... : the start of a real MP4.
const MP4 = [0x00, 0x00, 0x00, 0x20, 0x66, 0x74, 0x79, 0x70, 0x69, 0x73, 0x6f, 0x6d];
// The same bytes as Apps Script gives them (signed).
const SIGNED = MP4.map((b) => (b > 127 ? b - 256 : b));

test('Media_videoExt accepts MP4 and MOV only', () => {
  assert.equal(Media_videoExt('video/mp4'), 'mp4');
  assert.equal(Media_videoExt('VIDEO/QUICKTIME'), 'mov');
  assert.equal(Media_videoExt('video/webm'), '');
  assert.equal(Media_videoExt('image/jpeg'), '');
  assert.equal(Media_videoExt(undefined), '');
});

test('Media_videoProblem passes a small MP4 or MOV', () => {
  assert.equal(Media_videoProblem('video/mp4', MP4, 20), null);
  assert.equal(Media_videoProblem('video/quicktime', SIGNED, '20'), null);
});

test('Media_videoProblem rejects when videos are off', () => {
  assert.match(Media_videoProblem('video/mp4', MP4, 0), /ยังไม่เปิดรับวิดีโอ/);
  assert.match(Media_videoProblem('video/mp4', MP4, ''), /ยังไม่เปิดรับวิดีโอ/);
});

test('Media_videoProblem rejects a wrong type, empty data or fake content', () => {
  assert.match(Media_videoProblem('video/webm', MP4, 20), /MP4 หรือ MOV/);
  assert.match(Media_videoProblem('video/mp4', [], 20), /ไม่มีข้อมูล/);
  const jpeg = [0xff, 0xd8, 0xff, 0xe0, 0, 0x10, 0x4a, 0x46, 0x49, 0x46];
  assert.match(Media_videoProblem('video/mp4', jpeg, 20), /MP4 หรือ MOV/);
  assert.match(Media_videoProblem('video/mp4', MP4.slice(0, 6), 20), /MP4 หรือ MOV/);
});

test('Media_videoProblem rejects a video over the limit', () => {
  const big = { length: 20 * 1024 * 1024 + 1 };
  MP4.forEach((b, i) => { big[i] = b; });
  assert.match(Media_videoProblem('video/mp4', big, 20), /ใหญ่เกิน 20 MB/);
  const exact = Object.assign({}, big, { length: 20 * 1024 * 1024 });
  assert.equal(Media_videoProblem('video/mp4', exact, 20), null);
});
