// Video attachment checks (PLAN §12): one clip per request, MP4 or MOV, at most Config VIDEO_MAX_MB.
// Pure logic, so Node can test it; gas/Drive.js decodes the base64 and saves the file.

const MEDIA_VIDEO_EXT = { 'video/mp4': 'mp4', 'video/quicktime': 'mov' };

/** File extension for an accepted video mime type, or '' when the type is not accepted. */
function Media_videoExt(mime) {
  return MEDIA_VIDEO_EXT[String(mime || '').toLowerCase()] || '';
}

/**
 * Checks a decoded video. `bytes` is array-like (Apps Script bytes are signed). Returns null when
 * the video is fine, otherwise the Thai message to show. maxMb 0 (or less) means videos are off.
 */
function Media_videoProblem(mime, bytes, maxMb) {
  const max = Number(maxMb) || 0;
  if (max <= 0) return 'ระบบยังไม่เปิดรับวิดีโอ';
  if (!Media_videoExt(mime)) return 'วิดีโอ: รองรับเฉพาะไฟล์ MP4 หรือ MOV';
  if (!bytes || !bytes.length) return 'วิดีโอ: ไม่มีข้อมูลไฟล์';
  if (bytes.length > max * 1024 * 1024) return 'วิดีโอใหญ่เกิน ' + max + ' MB กรุณาตัดคลิปให้สั้นลง';
  // MP4 and MOV both start with a box whose type, at bytes 4-7, is "ftyp". The mime label comes
  // from the client and the file is shared by link, so the content is checked too.
  if (!Media_isFtyp_(bytes)) return 'วิดีโอ: รองรับเฉพาะไฟล์ MP4 หรือ MOV';
  return null;
}

function Media_isFtyp_(bytes) {
  const want = [0x66, 0x74, 0x79, 0x70]; // "ftyp"
  if (bytes.length < 8) return false;
  for (let i = 0; i < 4; i++) if ((bytes[4 + i] & 0xff) !== want[i]) return false;
  return true;
}

if (typeof module !== 'undefined') module.exports = { Media_videoExt, Media_videoProblem, MEDIA_VIDEO_EXT };
