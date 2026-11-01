// LINE Flex card builders (PLAN §8). Every builder returns one message object.
// `ref` carries display names: {branchName, categoryName} (see Jobs_ref_).

const FLEX_PRIORITY_COLOR = { EMERGENCY: '#D32F2F', URGENT: '#F57C00', NORMAL: '#1976D2', PREVENTIVE: '#757575' };
const FLEX_DETAIL_MAX = 120;
const FLEX_ALT_MAX = 400;
const FLEX_MUTED = '#888888';

function Flex_welcome() {
  return Flex_message_('ยินดีต้อนรับสู่ระบบแจ้งซ่อม กรุณาลงทะเบียนก่อนใช้งาน', {
    type: 'bubble',
    body: Flex_box_([
      Flex_text_('ยินดีต้อนรับสู่ระบบแจ้งซ่อม', { weight: 'bold', size: 'lg' }),
      Flex_text_('กรุณาลงทะเบียนชื่อ เบอร์โทร และร้านของคุณก่อนเริ่มแจ้งซ่อม', { size: 'sm', color: FLEX_MUTED }),
    ]),
    footer: Flex_box_([Flex_uriButton_('ลงทะเบียน', Flex_liffUrl('register.html'), true)]),
  });
}

/**
 * New job for candidates (create, forward, reassign).
 * opts: {note: shown above the job (e.g. forward reason), photoUrl: hero image or ''}.
 */
function Flex_jobNew(job, ref, opts) {
  opts = opts || {};
  const id = String(job.job_id);
  const contents = [
    Flex_idRow_(job),
    opts.note ? Flex_text_(opts.note, { size: 'sm', color: '#E65100', weight: 'bold' }) : null,
    Flex_text_(Flex_where_(job, ref), { size: 'sm', color: FLEX_MUTED }),
    Flex_text_('หมวด: ' + (ref.categoryName || job.category_code), { size: 'sm', color: FLEX_MUTED }),
    Flex_text_(job.title, { weight: 'bold', size: 'md' }),
    job.detail ? Flex_text_(Flex_truncate_(job.detail, FLEX_DETAIL_MAX), { size: 'sm' }) : null,
    Flex_separator_(),
    Flex_text_('ผู้แจ้ง: ' + (job.reporter_name || '-') + (job.reporter_phone ? ' (' + job.reporter_phone + ')' : '') +
      ' · ' + Flex_date(job.created_at), { size: 'xs', color: FLEX_MUTED }),
    Flex_text_('ต้องเข้าหน้างานภายใน ' + Flex_date(job.response_due_at), { size: 'sm', weight: 'bold', color: '#D32F2F' }),
  ];
  const bubble = {
    type: 'bubble',
    body: Flex_box_(contents),
    footer: Flex_box_([
      Flex_postbackButton_('รับงาน', 'a=accept&j=' + id, 'รับงาน ' + id, true),
      Flex_uriButton_('ปฏิเสธ', Flex_liffUrl('job.html', { id: id, do: 'reject' })),
      Flex_uriButton_('รายละเอียด', Flex_liffUrl('job.html', { id: id })),
    ]),
  };
  if (opts.photoUrl) {
    bubble.hero = {
      type: 'image', url: opts.photoUrl, size: 'full', aspectRatio: '20:13', aspectMode: 'cover',
      action: { type: 'uri', label: 'ดูรูป', uri: Flex_liffUrl('job.html', { id: id }) },
    };
  }
  return Flex_message_('งานซ่อมใหม่ ' + id + ': ' + job.title, bubble);
}

/** Reply to the reporter after liff.sendMessages(job_id). */
function Flex_jobReceived(job, ref) {
  const id = String(job.job_id);
  return Flex_message_('รับเรื่องแจ้งซ่อม ' + id + ' แล้ว', {
    type: 'bubble',
    body: Flex_box_([
      Flex_text_('รับเรื่องแจ้งซ่อมแล้ว', { weight: 'bold', size: 'lg', color: '#2E7D32' }),
      Flex_idRow_(job),
      Flex_text_(job.title, { weight: 'bold' }),
      Flex_text_(Flex_where_(job, ref), { size: 'sm', color: FLEX_MUTED }),
      Flex_text_('สถานะ: ' + Flex_statusLabel_(job.status), { size: 'sm' }),
      Flex_text_('ช่างจะเข้าหน้างานภายใน ' + Flex_date(job.response_due_at), { size: 'sm', color: FLEX_MUTED }),
    ]),
    footer: Flex_box_([Flex_uriButton_('ดูสถานะ', Flex_liffUrl('job.html', { id: id }), true)]),
  });
}

/** Reply to whoever tapped "รับงาน": a card on success, the error text otherwise. */
function Flex_acceptResult(job, errorMessage) {
  if (errorMessage) return Line_text(errorMessage);
  const id = String(job.job_id);
  return Flex_message_('รับงาน ' + id + ' แล้ว', {
    type: 'bubble',
    body: Flex_box_([
      Flex_text_('รับงานแล้ว', { weight: 'bold', size: 'lg', color: '#2E7D32' }),
      Flex_idRow_(job),
      Flex_text_(job.title, { weight: 'bold' }),
      Flex_text_('ต้องเข้าหน้างานภายใน ' + Flex_date(job.response_due_at), { size: 'sm', color: '#D32F2F' }),
    ]),
    footer: Flex_box_([Flex_uriButton_('เปิดงาน', Flex_liffUrl('job.html', { id: id }), true)]),
  });
}

/** Push to ADMINs when a candidate or assignee rejects. */
function Flex_jobRejected(job, ref, reason, byName) {
  const id = String(job.job_id);
  return Flex_message_('ช่างปฏิเสธงาน ' + id + ': ' + reason, {
    type: 'bubble',
    body: Flex_box_([
      Flex_text_('ช่างปฏิเสธงาน', { weight: 'bold', size: 'lg', color: '#D32F2F' }),
      Flex_idRow_(job),
      Flex_text_(job.title, { weight: 'bold' }),
      Flex_text_(Flex_where_(job, ref), { size: 'sm', color: FLEX_MUTED }),
      Flex_separator_(),
      Flex_text_('โดย: ' + (byName || '-'), { size: 'sm' }),
      Flex_text_('เหตุผล: ' + reason, { size: 'sm' }),
    ]),
    footer: Flex_box_([Flex_uriButton_('จ่ายงานใหม่', Flex_liffUrl('admin.html', { id: id }), true)]),
  });
}

/** Push to the reporter (or branch MANAGERs) when the job is closed by the technician. */
function Flex_jobDone(job, ref) {
  const id = String(job.job_id);
  const cost = Number(job.cost_total) || 0;
  return Flex_message_('งานซ่อม ' + id + ' เสร็จแล้ว กรุณากดรับทราบงาน', {
    type: 'bubble',
    body: Flex_box_([
      Flex_text_('งานซ่อมเสร็จแล้ว', { weight: 'bold', size: 'lg', color: '#2E7D32' }),
      Flex_idRow_(job),
      Flex_text_(job.title, { weight: 'bold' }),
      Flex_text_(Flex_where_(job, ref), { size: 'sm', color: FLEX_MUTED }),
      Flex_separator_(),
      Flex_text_('สาเหตุ: ' + job.cause, { size: 'sm' }),
      Flex_text_('วิธีแก้ไข: ' + job.fix, { size: 'sm' }),
      Flex_text_('ค่าใช้จ่าย: ' + cost.toLocaleString('en-US') + ' บาท', { size: 'sm' }),
      job.onsite_note ? Flex_text_('หมายเหตุ: ' + job.onsite_note, { size: 'sm', color: FLEX_MUTED }) : null,
      Flex_text_('ช่าง: ' + (job.assignee_name || job.vendor || '-') + ' · ' + Flex_date(job.done_at), { size: 'xs', color: FLEX_MUTED }),
    ]),
    footer: Flex_box_([
      Flex_postbackButton_('รับทราบงาน', 'a=ack&j=' + id, 'รับทราบงาน ' + id, true),
      Flex_uriButton_('รายละเอียด', Flex_liffUrl('job.html', { id: id })),
    ]),
  });
}

/** Reply to whoever tapped "รับทราบงาน". */
function Flex_ackResult(job, errorMessage) {
  if (errorMessage) return Line_text(errorMessage);
  return Line_text('รับทราบงาน ' + job.job_id + ' แล้ว ปิดงานเรียบร้อย');
}

/** Push to ADMINs: a technician asks for a later due date (PLAN §8 ext_request). */
function Flex_extRequest(job, ref, byName) {
  const id = String(job.job_id);
  return Flex_message_('ขอเลื่อนกำหนดงาน ' + id + ' เป็น ' + Flex_date(job.ext_requested_due_at), {
    type: 'bubble',
    body: Flex_box_([
      Flex_text_('ช่างขอเลื่อนกำหนดเสร็จ', { weight: 'bold', size: 'lg', color: '#E65100' }),
      Flex_idRow_(job),
      Flex_text_(job.title, { weight: 'bold' }),
      Flex_text_(Flex_where_(job, ref), { size: 'sm', color: FLEX_MUTED }),
      Flex_separator_(),
      Flex_text_('กำหนดเดิม: ' + Flex_date(job.due_at), { size: 'sm' }),
      Flex_text_('ขอเลื่อนเป็น: ' + Flex_date(job.ext_requested_due_at), { size: 'sm', weight: 'bold' }),
      Flex_text_('เหตุผล: ' + job.ext_reason, { size: 'sm' }),
      Flex_text_('โดย: ' + (byName || job.assignee_name || '-'), { size: 'xs', color: FLEX_MUTED }),
    ]),
    footer: Flex_box_([
      Flex_postbackButton_('อนุมัติ', 'a=ext_ok&j=' + id, 'อนุมัติขอเลื่อน ' + id, true),
      Flex_postbackButton_('ไม่อนุมัติ', 'a=ext_no&j=' + id, 'ไม่อนุมัติขอเลื่อน ' + id, false),
      Flex_uriButton_('ดูงาน', Flex_liffUrl('admin.html', { id: id })),
    ]),
  });
}

/** Push to the assignee with the decision (PLAN §8 ext_result). */
function Flex_extResult(job, approved, note) {
  const id = String(job.job_id);
  return Flex_message_((approved ? 'อนุมัติ' : 'ไม่อนุมัติ') + 'ขอเลื่อนงาน ' + id, {
    type: 'bubble',
    body: Flex_box_([
      Flex_text_(approved ? 'อนุมัติขอเลื่อนแล้ว' : 'ไม่อนุมัติขอเลื่อน', { weight: 'bold', size: 'lg', color: approved ? '#2E7D32' : '#D32F2F' }),
      Flex_idRow_(job),
      Flex_text_(job.title, { weight: 'bold' }),
      Flex_text_('กำหนดเสร็จ: ' + Flex_date(job.due_at), { size: 'sm', weight: 'bold' }),
      note ? Flex_text_('หมายเหตุ: ' + note, { size: 'sm' }) : null,
    ]),
    footer: Flex_box_([Flex_uriButton_('เปิดงาน', Flex_liffUrl('job.html', { id: id }), true)]),
  });
}

const FLEX_SLA_LABEL = {
  R75: { text: 'ใกล้ครบเวลาเข้าหน้างาน', color: '#F57C00', field: 'response_due_at' },
  RB: { text: 'เลยเวลาเข้าหน้างานแล้ว', color: '#D32F2F', field: 'response_due_at' },
  D75: { text: 'ใกล้ครบกำหนดเสร็จ', color: '#F57C00', field: 'due_at' },
  DB: { text: 'เลยกำหนดเสร็จแล้ว', color: '#D32F2F', field: 'due_at' },
};
const FLEX_CAROUSEL_MAX = 12; // LINE limit per carousel
const FLEX_MESSAGES_MAX = 5;  // LINE limit per push

/**
 * sla_alert for one recipient: items [{job, flags[]}] -> up to 5 carousel messages (one push,
 * counted once against the quota). Items beyond 60 are summarised in the last bubble.
 */
function Flex_slaAlerts(items) {
  const cap = FLEX_CAROUSEL_MAX * FLEX_MESSAGES_MAX;
  const shown = items.slice(0, items.length > cap ? cap - 1 : cap);
  const bubbles = shown.map(function (it) {
    const job = it.job;
    const id = String(job.job_id);
    return {
      type: 'bubble', size: 'kilo',
      body: Flex_box_([Flex_idRow_(job), Flex_text_(job.title, { weight: 'bold', size: 'sm' })].concat(
        it.flags.map(function (f) {
          const l = FLEX_SLA_LABEL[f];
          return Flex_text_(l.text + ' (' + Flex_date(job[l.field]) + ')', { size: 'xs', weight: 'bold', color: l.color });
        }))),
      footer: Flex_box_([Flex_uriButton_('เปิดงาน', Flex_liffUrl('job.html', { id: id }), true)]),
    };
  });
  if (items.length > shown.length) {
    bubbles.push({
      type: 'bubble', size: 'kilo',
      body: Flex_box_([Flex_text_('และอีก ' + (items.length - shown.length) + ' งาน', { weight: 'bold' })]),
      footer: Flex_box_([Flex_uriButton_('ดูทั้งหมด', Flex_liffUrl('jobs.html'), true)]),
    });
  }
  const messages = [];
  for (let i = 0; i < bubbles.length; i += FLEX_CAROUSEL_MAX) {
    messages.push({
      type: 'flex',
      altText: Flex_truncate_('แจ้งเตือนเวลางานซ่อม ' + items.length + ' งาน', FLEX_ALT_MAX),
      contents: { type: 'carousel', contents: bubbles.slice(i, i + FLEX_CAROUSEL_MAX) },
    });
  }
  return messages;
}

/** Reply to whoever tapped อนุมัติ/ไม่อนุมัติ. */
function Flex_extDecisionResult(job, approved, errorMessage) {
  if (errorMessage) return Line_text(errorMessage);
  return Line_text((approved ? 'อนุมัติขอเลื่อน ' : 'ไม่อนุมัติขอเลื่อน ') + job.job_id +
    ' แล้ว กำหนดเสร็จ ' + Flex_date(job.due_at));
}

/** Reply to "งานของฉัน": up to 5 open jobs, each row opens the job page. */
function Flex_myJobs(jobs, total) {
  if (!jobs.length) return Line_text('ไม่มีงานที่ยังเปิดอยู่');
  const rows = [Flex_text_('งานของฉันที่ยังเปิดอยู่ (' + total + ')', { weight: 'bold', size: 'md' })];
  jobs.forEach(function (job) {
    rows.push(Flex_separator_());
    rows.push({
      type: 'box', layout: 'vertical', spacing: 'xs',
      action: { type: 'uri', label: 'เปิดงาน', uri: Flex_liffUrl('job.html', { id: String(job.job_id) }) },
      contents: [
        Flex_text_(job.job_id + ' · ' + Flex_statusLabel_(job.status), { size: 'xs', color: FLEX_MUTED }),
        Flex_text_(job.title, { size: 'sm', weight: 'bold' }),
      ],
    });
  });
  return Flex_message_('งานของฉันที่ยังเปิดอยู่ ' + total + ' งาน', {
    type: 'bubble',
    body: Flex_box_(rows),
    footer: Flex_box_([Flex_uriButton_('ดูทั้งหมด', Flex_liffUrl('jobs.html'), false)]),
  });
}

function Flex_help() {
  return Line_text('พิมพ์ "งานของฉัน" เพื่อดูงานที่ยังเปิดอยู่ หรือกดเมนู "แจ้งซ่อม" ด้านล่างเพื่อแจ้งงานใหม่');
}

function Flex_notRegistered() {
  return Flex_message_('กรุณาลงทะเบียนก่อนใช้งาน', {
    type: 'bubble',
    body: Flex_box_([Flex_text_('คุณยังไม่ได้ลงทะเบียน หรือบัญชีถูกปิดใช้งาน', { size: 'sm' })]),
    footer: Flex_box_([Flex_uriButton_('ลงทะเบียน', Flex_liffUrl('register.html'), true)]),
  });
}

/** https://liff.line.me/{LIFF_ID}/{page}?{params} (PLAN §9). */
function Flex_liffUrl(page, params) {
  const liffId = (PropertiesService.getScriptProperties().getProperty('LIFF_ID') || '').trim();
  if (!liffId) throw new Error('LIFF_ID is not set');
  const qs = Object.keys(params || {}).map(function (k) {
    return encodeURIComponent(k) + '=' + encodeURIComponent(params[k]);
  }).join('&');
  return 'https://liff.line.me/' + liffId + '/' + page + (qs ? '?' + qs : '');
}

/** dd/MM/yy HH:mm in Asia/Bangkok; '-' when empty. */
function Flex_date(value) {
  if (value === '' || value === null || value === undefined) return '-';
  const d = value instanceof Date ? value : new Date(value);
  if (isNaN(d.getTime())) return '-';
  return Utilities.formatDate(d, 'Asia/Bangkok', 'dd/MM/yy HH:mm');
}

// --- building blocks --------------------------------------------------------------

function Flex_message_(altText, bubble) {
  return { type: 'flex', altText: Flex_truncate_(altText, FLEX_ALT_MAX), contents: bubble };
}

function Flex_box_(contents) {
  return { type: 'box', layout: 'vertical', spacing: 'sm', contents: contents.filter(Boolean) };
}

/** LINE rejects empty text components, so blanks become '-'. */
function Flex_text_(text, style) {
  const value = String(text === undefined || text === null ? '' : text).trim();
  return Object.assign({ type: 'text', text: value || '-', wrap: true }, style || {});
}

function Flex_separator_() {
  return { type: 'separator', margin: 'md' };
}

function Flex_idRow_(job) {
  const priority = String(job.priority || '');
  return {
    type: 'box', layout: 'horizontal', spacing: 'sm',
    contents: [
      Flex_text_(job.job_id, { weight: 'bold', size: 'sm', flex: 0, gravity: 'center' }),
      {
        type: 'box', layout: 'vertical', flex: 0, cornerRadius: 'sm', paddingAll: 'xs',
        paddingStart: 'sm', paddingEnd: 'sm', backgroundColor: FLEX_PRIORITY_COLOR[priority] || '#757575',
        contents: [Flex_text_(priority || '-', { size: 'xxs', color: '#FFFFFF', weight: 'bold', wrap: false })],
      },
    ],
  };
}

function Flex_uriButton_(label, uri, primary) {
  return {
    type: 'button', style: primary ? 'primary' : 'secondary', height: 'sm',
    action: { type: 'uri', label: label, uri: uri },
  };
}

function Flex_postbackButton_(label, data, displayText, primary) {
  return {
    type: 'button', style: primary ? 'primary' : 'secondary', height: 'sm',
    action: { type: 'postback', label: label, data: data, displayText: displayText },
  };
}

function Flex_where_(job, ref) {
  const branch = (ref && ref.branchName) || job.branch_code || '-';
  return job.area ? branch + ' · ' + job.area : branch;
}

function Flex_statusLabel_(status) {
  return STATUS_LABEL_TH[status] || String(status || '-');
}

function Flex_truncate_(text, max) {
  const s = String(text === undefined || text === null ? '' : text);
  return s.length > max ? s.slice(0, max - 1) + '…' : s;
}
