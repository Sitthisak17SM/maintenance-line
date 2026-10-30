// Shared UI helpers for LIFF pages. All user-supplied text goes through textContent (el/text),
// never innerHTML, because job titles and details come from other users.

const PRIORITY_COLORS = { EMERGENCY: '#D32F2F', URGENT: '#F57C00', NORMAL: '#1976D2', PREVENTIVE: '#757575' };
const STATUS_TH = {
  NEW: 'รอจ่ายงาน', ASSIGNED: 'รอช่างรับงาน', ACCEPTED: 'รับงานแล้ว', IN_PROGRESS: 'กำลังซ่อม',
  DONE: 'รอรับทราบ', CLOSED: 'ปิดงานแล้ว', REJECTED: 'ถูกปฏิเสธ', CANCELLED: 'ยกเลิก',
};
const ACTION_TH = {
  create: 'แจ้งซ่อม', accept: 'รับงาน', reject: 'ปฏิเสธ', forward: 'ส่งต่อช่างนอก', reassign: 'จ่ายงาน',
  checkin: 'ถึงหน้างาน', close: 'ปิดงาน', ack: 'รับทราบงาน',
};

function $(selector, root) {
  return (root || document).querySelector(selector);
}

/** el('div', {class: 'card', onclick: fn}, child, 'text', ...) */
function el(tag, attrs) {
  const node = document.createElement(tag);
  Object.entries(attrs || {}).forEach(function ([k, v]) {
    if (v === undefined || v === null || v === false) return;
    if (k === 'class') node.className = v;
    else if (k === 'style') node.style.cssText = v;
    else if (k.startsWith('on')) node.addEventListener(k.slice(2), v);
    else if (k in node && typeof v !== 'string') node[k] = v;
    else node.setAttribute(k, v === true ? '' : v);
  });
  for (let i = 2; i < arguments.length; i++) append(node, arguments[i]);
  return node;
}

function append(parent, child) {
  if (child === undefined || child === null || child === false) return;
  if (Array.isArray(child)) child.forEach(function (c) { append(parent, c); });
  else parent.appendChild(child instanceof Node ? child : document.createTextNode(String(child)));
}

function clear(node) {
  while (node.firstChild) node.removeChild(node.firstChild);
  return node;
}

function render(node) {
  const root = clear($('#app'));
  append(root, Array.prototype.slice.call(arguments));
  return root;
}

function showLoading(message) {
  render(el('div', { class: 'center' }, el('div', { class: 'spinner' }), el('p', { class: 'muted' }, message || 'กำลังโหลด…')));
}

/** Full-page error with a retry button. */
function showError(err) {
  const box = el('div', { class: 'center' },
    el('p', { class: 'err' }, errorText(err)),
    el('button', { type: 'button', class: 'btn', onclick: function () { location.reload(); } }, 'ลองใหม่'));
  if (window.liff && liffReady && liff.isInClient()) {
    box.appendChild(el('button', { type: 'button', class: 'btn btn-secondary', onclick: function () { liff.closeWindow(); } }, 'ปิด'));
  }
  render(box);
}

function errorText(err) {
  if (!err) return 'เกิดข้อผิดพลาด';
  if (err.code === 'AUTH') return 'การเข้าสู่ระบบหมดอายุ กรุณากด "ลองใหม่"';
  if (err.code === 'INTERNAL') return 'ระบบขัดข้อง กรุณาลองใหม่อีกครั้ง';
  if (err instanceof TypeError) return 'เชื่อมต่อไม่ได้ กรุณาตรวจสอบอินเทอร์เน็ตแล้วลองใหม่';
  return err.message || String(err);
}

/** Inline message area inside a form; pass null to hide. */
function setMessage(node, err, ok) {
  node.textContent = err ? errorText(err) : (ok || '');
  node.className = 'msg ' + (err ? 'err' : 'ok');
  node.hidden = !err && !ok;
}

/**
 * Form validation failure: shows the message and takes the user to the field, which on a
 * long phone form may be far above the submit button.
 */
function invalid(msgNode, text, input) {
  setMessage(msgNode, new Error(text));
  if (input) {
    input.classList.add('invalid');
    input.addEventListener('input', function () { input.classList.remove('invalid'); }, { once: true });
    input.scrollIntoView({ behavior: 'smooth', block: 'center' });
    if (typeof input.focus === 'function') input.focus({ preventScroll: true });
  }
}

/**
 * Runs an async action with the button disabled and a busy label, showing errors in `msgNode`.
 * Resolves to the action's result, or undefined if it failed.
 */
async function busy(button, msgNode, label, fn) {
  const original = button.textContent;
  button.disabled = true;
  button.textContent = label || 'กำลังบันทึก…';
  if (msgNode) setMessage(msgNode, null);
  try {
    return await fn();
  } catch (err) {
    if (msgNode) setMessage(msgNode, err);
    else showError(err);
    return undefined;
  } finally {
    button.disabled = false;
    button.textContent = original;
  }
}

function priorityBadge(priority) {
  return el('span', { class: 'badge', style: 'background:' + (PRIORITY_COLORS[priority] || '#757575') }, priority || '-');
}

function statusBadge(status) {
  return el('span', { class: 'status status-' + String(status || '').toLowerCase() }, STATUS_TH[status] || status || '-');
}

/** dd/MM/yy HH:mm in Asia/Bangkok, matching the LINE cards. */
function fmtDate(value) {
  if (!value) return '-';
  const d = new Date(value);
  if (isNaN(d.getTime())) return String(value);
  const p = new Intl.DateTimeFormat('en-GB', {
    timeZone: 'Asia/Bangkok', day: '2-digit', month: '2-digit', year: '2-digit', hour: '2-digit', minute: '2-digit', hour12: false,
  }).formatToParts(d).reduce(function (acc, part) { acc[part.type] = part.value; return acc; }, {});
  return p.day + '/' + p.month + '/' + p.year + ' ' + p.hour + ':' + p.minute;
}

function fmtMoney(n) {
  return Number(n || 0).toLocaleString('th-TH', { minimumFractionDigits: 0, maximumFractionDigits: 2 }) + ' บาท';
}

function param(name) {
  return new URLSearchParams(location.search).get(name);
}

/** Labeled form row. */
function field(label, control, hint) {
  return el('label', { class: 'field' }, el('span', { class: 'label' }, label), control, hint ? el('span', { class: 'hint' }, hint) : null);
}

function option(value, text, selected) {
  return el('option', { value: value, selected: !!selected }, text);
}

/** Name lookup for codes from `me` (branches, categories). */
function nameOf(list, key, value, nameKey) {
  const row = (list || []).find(function (r) { return String(r[key]) === String(value); });
  return row ? row[nameKey] : value;
}
