// Clickable links in sheet cells. Pure logic: no Google services.
// Sheets only makes a plain-text cell clickable when the whole cell is one URL, so a cell
// holding several photo links (one per line) is written as rich text with a link per line.

/**
 * Link spans for a cell whose every non-blank line is an http(s) URL:
 * [{start, end, url}] with `end` exclusive (as RichTextValueBuilder.setLinkUrl takes it).
 * Returns [] for anything else, so ordinary text is never turned into links.
 */
function Links_spans(text) {
  if (typeof text !== 'string' || !text.trim()) return [];
  const spans = [];
  let offset = 0;
  const ok = text.split('\n').every(function (line) {
    const url = line.trim();
    if (url) {
      if (!/^https?:\/\/\S+$/.test(url)) return false;
      const start = offset + line.indexOf(url);
      spans.push({ start: start, end: start + url.length, url: url });
    }
    offset += line.length + 1;
    return true;
  });
  return ok ? spans : [];
}

if (typeof module !== 'undefined') module.exports = { Links_spans };
