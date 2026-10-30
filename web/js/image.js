// Photo resize before upload (PLAN §9): long edge <= maxEdge px, JPEG quality 0.7.
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
function photoPicker(maxCount, maxEdge, label) {
  const items = [];
  const grid = el('div', { class: 'thumbs' });
  const msg = el('p', { class: 'msg err', hidden: true });
  const input = el('input', { type: 'file', accept: 'image/*', capture: 'environment', multiple: true, class: 'visually-hidden' });
  const addBtn = el('button', { type: 'button', class: 'btn btn-secondary', onclick: function () { input.click(); } });

  function refresh() {
    clear(grid);
    items.forEach(function (item, i) {
      grid.appendChild(el('div', { class: 'thumb' },
        el('img', { src: item.preview, alt: 'รูปที่ ' + (i + 1) }),
        el('button', { type: 'button', class: 'thumb-remove', 'aria-label': 'ลบรูป', onclick: function () { items.splice(i, 1); refresh(); } }, '×')));
    });
    addBtn.textContent = (label || 'เพิ่มรูป') + ' (' + items.length + '/' + maxCount + ')';
    addBtn.disabled = items.length >= maxCount;
  }

  input.addEventListener('change', async function () {
    const files = Array.from(input.files || []);
    input.value = '';
    setMessage(msg, null);
    const room = maxCount - items.length;
    if (files.length > room) setMessage(msg, new Error('แนบรูปได้ไม่เกิน ' + maxCount + ' รูป ระบบเลือกให้ ' + room + ' รูปแรก'));
    addBtn.disabled = true;
    addBtn.textContent = 'กำลังย่อรูป…';
    for (const file of files.slice(0, room)) {
      try {
        items.push(await resizeImage(file, maxEdge));
      } catch (err) {
        setMessage(msg, err);
      }
    }
    refresh();
  });

  refresh();
  return {
    node: el('div', { class: 'picker' }, grid, addBtn, input, msg),
    photos: function () { return items.map(function (p) { return { mime: p.mime, b64: p.b64 }; }); },
    count: function () { return items.length; },
  };
}
