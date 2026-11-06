// Photo resize before upload (PLAN §9): long edge <= maxEdge px, JPEG quality 0.7. Also the video picker (§12).
// Server limits: PHOTO_MAX_COUNT photos per request, 2 MB each after decoding.

const IMAGE_JPEG_QUALITY = 0.7;

/** Resolves to {mime, b64} (base64 without the data: prefix) plus a preview data URL. */
async function resizeImage(file, maxEdge) {
  const img = await loadImage_(file);
  const scale = Math.min(1, maxEdge / Math.max(img.naturalWidth, img.naturalHeight));
  const w = Math.max(1, Math.round(img.naturalWidth * scale));
  const h = Math.max(1, Math.round(img.naturalHeight * scale));
  const canvas = document.createElement('canvas');
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext('2d');
  ctx.fillStyle = '#fff'; // transparent PNGs would turn black as JPEG
  ctx.fillRect(0, 0, w, h);
  ctx.drawImage(img, 0, 0, w, h);
  const dataUrl = canvas.toDataURL('image/jpeg', IMAGE_JPEG_QUALITY);
  return { mime: 'image/jpeg', b64: dataUrl.slice(dataUrl.indexOf(',') + 1), preview: dataUrl };
}

function loadImage_(file) {
  return new Promise(function (resolve, reject) {
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = function () { URL.revokeObjectURL(url); resolve(img); };
    img.onerror = function () { URL.revokeObjectURL(url); reject(new Error('เปิดรูป ' + file.name + ' ไม่ได้ กรุณาเลือกไฟล์รูปภาพ')); };
    img.src = url;
  });
}

/**
 * A photo picker with previews and remove buttons. Returns {node, photos()} where photos()
 * gives the [{mime, b64}] list for the API.
 */
function photoPicker(maxCount, maxEdge) {
  const items = [];
  const grid = el('div', { class: 'thumbs' });
  const msg = el('p', { class: 'msg err', hidden: true });
  // Two inputs: with capture the phone opens the camera directly; without it, the photo library.
  const camera = el('input', { type: 'file', accept: 'image/*', capture: 'environment', class: 'visually-hidden' });
  const library = el('input', { type: 'file', accept: 'image/*', multiple: true, class: 'visually-hidden' });
  const cameraBtn = el('button', { type: 'button', class: 'btn btn-secondary', onclick: function () { camera.click(); } }, 'ถ่ายรูป');
  const libraryBtn = el('button', { type: 'button', class: 'btn btn-secondary', onclick: function () { library.click(); } }, 'คลังภาพ');
  const count = el('span', { class: 'hint' });

  function refresh() {
    clear(grid);
    items.forEach(function (item, i) {
      grid.appendChild(el('div', { class: 'thumb' },
        el('img', { src: item.preview, alt: 'รูปที่ ' + (i + 1) }),
        el('button', { type: 'button', class: 'thumb-remove', 'aria-label': 'ลบรูป', onclick: function () { items.splice(i, 1); refresh(); } }, '×')));
    });
    count.textContent = 'แนบแล้ว ' + items.length + '/' + maxCount + ' รูป';
    cameraBtn.disabled = libraryBtn.disabled = items.length >= maxCount;
  }

  async function onPick(input) {
    const files = Array.from(input.files || []);
    input.value = '';
    setMessage(msg, null);
    const room = maxCount - items.length;
    if (files.length > room) setMessage(msg, new Error('แนบรูปได้ไม่เกิน ' + maxCount + ' รูป ระบบเลือกให้ ' + room + ' รูปแรก'));
    cameraBtn.disabled = libraryBtn.disabled = true;
    count.textContent = 'กำลังย่อรูป…';
    for (const file of files.slice(0, room)) {
      try {
        items.push(await resizeImage(file, maxEdge));
      } catch (err) {
        setMessage(msg, err);
      }
    }
    refresh();
  }
  camera.addEventListener('change', function () { onPick(camera); });
  library.addEventListener('change', function () { onPick(library); });

  refresh();
  return {
    node: el('div', { class: 'picker' }, grid, el('div', { class: 'btn-row' }, cameraBtn, libraryBtn), count, camera, library, msg),
    photos: function () { return items.map(function (p) { return { mime: p.mime, b64: p.b64 }; }); },
    count: function () { return items.length; },
  };
}

/** Mime type the server accepts (MP4 or MOV, PLAN §12), from the file type or its extension. */
function videoMime_(file) {
  const type = String(file.type || '').toLowerCase();
  if (type === 'video/mp4' || type === 'video/quicktime') return type;
  const ext = String(file.name || '').toLowerCase().split('.').pop();
  if (ext === 'mp4' || ext === 'm4v') return 'video/mp4';
  if (ext === 'mov') return 'video/quicktime';
  return '';
}

function readBase64_(file) {
  return new Promise(function (resolve, reject) {
    const reader = new FileReader();
    reader.onload = function () { const s = String(reader.result); resolve(s.slice(s.indexOf(',') + 1)); };
    reader.onerror = function () { reject(new Error('อ่านไฟล์วิดีโอไม่ได้ กรุณาเลือกใหม่')); };
    reader.readAsDataURL(file);
  });
}

/**
 * One optional video, up to maxMb (Config VIDEO_MAX_MB). Videos are not resized, so a clip over
 * the limit is refused here with a hint to trim it. Returns {node, video()} where video() gives
 * {mime, b64} for the API, or null.
 */
function videoPicker(maxMb) {
  let picked = null; // {mime, b64, url}
  const box = el('div', {});
  const msg = el('p', { class: 'msg err', hidden: true });
  const camera = el('input', { type: 'file', accept: 'video/*', capture: 'environment', class: 'visually-hidden' });
  const library = el('input', { type: 'file', accept: 'video/*', class: 'visually-hidden' });
  const cameraBtn = el('button', { type: 'button', class: 'btn btn-secondary', onclick: function () { camera.click(); } }, 'ถ่ายวิดีโอ');
  const libraryBtn = el('button', { type: 'button', class: 'btn btn-secondary', onclick: function () { library.click(); } }, 'คลังวิดีโอ');
  const buttons = el('div', { class: 'btn-row' }, cameraBtn, libraryBtn);
  const hint = el('span', { class: 'hint' }, 'ไม่บังคับ 1 คลิป ไม่เกิน ' + maxMb + ' MB (ประมาณ 10–20 วินาที)');

  function refresh() {
    clear(box);
    if (picked) {
      box.appendChild(el('div', { class: 'video-preview' },
        el('video', { src: picked.url, controls: true, playsinline: true, muted: true, preload: 'metadata' }),
        el('button', { type: 'button', class: 'thumb-remove', 'aria-label': 'ลบวิดีโอ', onclick: remove }, '×')));
    }
    buttons.hidden = !!picked;
    hint.hidden = !!picked;
  }

  function remove() {
    if (picked) URL.revokeObjectURL(picked.url);
    picked = null;
    refresh();
  }

  async function onPick(input) {
    const file = (input.files || [])[0];
    input.value = '';
    setMessage(msg, null);
    if (!file) return;
    const mime = videoMime_(file);
    if (!mime) return setMessage(msg, new Error('รองรับเฉพาะวิดีโอ MP4 หรือ MOV'));
    if (file.size > maxMb * 1024 * 1024) {
      return setMessage(msg, new Error('วิดีโอนี้ใหญ่ ' + (file.size / 1024 / 1024).toFixed(1) + ' MB เกิน ' + maxMb +
        ' MB กรุณาตัดคลิปให้สั้นลงในแอปรูปภาพ แล้วเลือกใหม่'));
    }
    cameraBtn.disabled = libraryBtn.disabled = true;
    hint.textContent = 'กำลังเตรียมวิดีโอ…';
    try {
      picked = { mime: mime, b64: await readBase64_(file), url: URL.createObjectURL(file) };
    } catch (err) {
      setMessage(msg, err);
    }
    cameraBtn.disabled = libraryBtn.disabled = false;
    hint.textContent = 'ไม่บังคับ 1 คลิป ไม่เกิน ' + maxMb + ' MB (ประมาณ 10–20 วินาที)';
    refresh();
  }
  camera.addEventListener('change', function () { onPick(camera); });
  library.addEventListener('change', function () { onPick(library); });

  refresh();
  return {
    node: el('div', { class: 'picker' }, box, buttons, hint, camera, library, msg),
    video: function () { return picked ? { mime: picked.mime, b64: picked.b64 } : null; },
  };
}
