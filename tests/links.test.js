const test = require('node:test');
const assert = require('node:assert/strict');
const { Links_spans } = require('../gas/core/Links.js');

const A = 'https://drive.google.com/file/d/AAA/view';
const B = 'https://drive.google.com/file/d/BBB/view';

test('Links_spans gives one span per URL line', () => {
  const text = A + '\n' + B;
  const spans = Links_spans(text);
  assert.deepEqual(spans, [
    { start: 0, end: A.length, url: A },
    { start: A.length + 1, end: A.length + 1 + B.length, url: B },
  ]);
  spans.forEach((s) => assert.equal(text.slice(s.start, s.end), s.url));
});

test('Links_spans handles a single URL and skips blank lines', () => {
  assert.deepEqual(Links_spans(A), [{ start: 0, end: A.length, url: A }]);
  const text = A + '\n\n' + B + '\n';
  assert.deepEqual(Links_spans(text).map((s) => text.slice(s.start, s.end)), [A, B]);
});

test('Links_spans leaves ordinary text, mixed text and non-strings alone', () => {
  assert.deepEqual(Links_spans('น้ำรั่วใต้บาร์'), []);
  assert.deepEqual(Links_spans(A + '\nดูรูปนี้'), []);
  assert.deepEqual(Links_spans('javascript:alert(1)'), []);
  assert.deepEqual(Links_spans(''), []);
  assert.deepEqual(Links_spans(42), []);
  assert.deepEqual(Links_spans(new Date()), []);
});
