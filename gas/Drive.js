// Photo storage (PLAN §12): base64 -> Drive file in DRIVE_FOLDER_ID/YYYY-MM/.

const DRIVE_MAX_PHOTO_BYTES = 2 * 1024 * 1024;
const DRIVE_PHOTO_EXT = { 'image/jpeg': 'jpg', 'image/png': 'png' };

/**
 * Checks the request's photos ([{mime, b64}]) before anything is stored and returns
 * [{mime, bytes}]. Throws VALIDATION for too many, wrong type or over 2 MB after decoding.
 */
function Drive_decodePhotos(photos, maxCount) {
  if (photos === undefined || photos === null) return [];
  if (!Array.isArray(photos)) throw Status_error('VALIDATION', 'รูปแบบรูปไม่ถูกต้อง');
  if (photos.length > maxCount) throw Status_error('VALIDATION', 'แนบรูปได้ไม่เกิน ' + maxCount + ' รูป');
  return photos.map(function (p, i) {
    const n = i + 1;
    const mime = String((p && p.mime) || '').toLowerCase();
    if (!DRIVE_PHOTO_EXT[mime]) throw Status_error('VALIDATION', 'รูปที่ ' + n + ': รองรับเฉพาะ JPEG หรือ PNG');
    let bytes;
    try {
      bytes = Utilities.base64Decode(String(p.b64 || '').replace(/^data:[^,]*,/, ''));
    } catch (err) {
      throw Status_error('VALIDATION', 'รูปที่ ' + n + ': ข้อมูลรูปเสีย');
    }
    if (!bytes.length) throw Status_error('VALIDATION', 'รูปที่ ' + n + ': ไม่มีข้อมูลรูป');
    if (bytes.length > DRIVE_MAX_PHOTO_BYTES) throw Status_error('VALIDATION', 'รูปที่ ' + n + ': ใหญ่เกิน 2 MB');
    return { mime: mime, bytes: bytes };
  });
}

/**
 * Saves decoded photos as {job_id}_{kind}_{n}.jpg in the YYYY-MM folder of `when`, shared as
 * "anyone with the link can view" so LIFF pages and cards can show them. Returns the file IDs.
 */
function Drive_savePhotos(jobId, kind, decoded, when) {
  if (!decoded || !decoded.length) return [];
  const folder = Drive_monthFolder_(when);
  return decoded.map(function (photo, i) {
    const name = jobId + '_' + kind + '_' + (i + 1) + '.' + DRIVE_PHOTO_EXT[photo.mime];
    const file = folder.createFile(Utilities.newBlob(photo.bytes, photo.mime, name));
    try {
      file.setSharing(DriveApp.Access.ANYONE_WITH_LINK, DriveApp.Permission.VIEW);
    } catch (err) {
      // Some Workspace domains forbid link sharing; the file is still saved.
      console.warn('Cannot share %s: %s', name, err);
    }
    return file.getId();
  });
}

/** URL for <img> in LIFF pages (PLAN §12). */
function Drive_thumbnailUrl(fileId) {
  return 'https://drive.google.com/thumbnail?id=' + encodeURIComponent(fileId) + '&sz=w1000';
}

/**
 * URL for a Flex hero image. LINE fetches it server-side, so it uses the direct
 * googleusercontent form (no redirect). Whether LINE shows it is recorded in PLAN §18.
 */
function Drive_flexImageUrl(fileId) {
  return 'https://lh3.googleusercontent.com/d/' + encodeURIComponent(fileId) + '=w1000';
}

function Drive_monthFolder_(when) {
  const id = PropertiesService.getScriptProperties().getProperty('DRIVE_FOLDER_ID');
  if (!id) throw new Error('DRIVE_FOLDER_ID is not set. Run Setup_init first.');
  const name = Utilities.formatDate(when || new Date(), 'Asia/Bangkok', 'yyyy-MM');
  // Under the lock so two uploads at the start of a month don't create two folders.
  return Repo_withLock(function () {
    const root = DriveApp.getFolderById(id);
    const it = root.getFoldersByName(name);
    return it.hasNext() ? it.next() : root.createFolder(name);
  });
}
