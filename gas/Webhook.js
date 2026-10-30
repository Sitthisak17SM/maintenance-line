// LINE webhook (PLAN §7). URL: {API_URL}?key={WEBHOOK_KEY}. Keep it light: one sheet write and one reply per event.

const WEBHOOK_DEDUP_SECONDS = 6 * 3600;
const WEBHOOK_PAYLOAD_MAX_CHARS = 49000; // sheet cell limit is 50,000

function Webhook_handle(e) {
  const expected = PropertiesService.getScriptProperties().getProperty('WEBHOOK_KEY');
  if (!expected || e.parameter.key !== expected) return Webhook_ok_();

  let events = [];
  try {
    events = JSON.parse(e.postData.contents).events || [];
  } catch (err) {
    console.error('Webhook: invalid body');
    return Webhook_ok_();
  }

  let isTest = false;
  try {
    isTest = Repo_getConfig().ENV === 'test';
  } catch (err) {
    console.error('Webhook: cannot read Config: %s', err);
  }

  events.forEach(function (event) {
    try {
      Webhook_handleEvent_(event, isTest);
    } catch (err) {
      console.error('Webhook event %s failed: %s', event.webhookEventId, err.stack || err);
    }
  });
  return Webhook_ok_();
}

function Webhook_handleEvent_(event, isTest) {
  if (Webhook_isDuplicate_(event.webhookEventId)) return;

  if (isTest) {
    Repo_append('WebhookLog', {
      at: new Date(),
      event_type: event.type,
      user_id: (event.source && event.source.userId) || '',
      webhook_event_id: event.webhookEventId || '',
      payload: JSON.stringify(event).slice(0, WEBHOOK_PAYLOAD_MAX_CHARS),
    });
  }

  if (!event.source || event.source.type !== 'user') return;

  if (event.type === 'follow') {
    Line_reply(event.replyToken, [Line_text('ยินดีต้อนรับสู่ระบบแจ้งซ่อม (ทดสอบ)')]);
  } else if (event.type === 'message' && event.message.type === 'text') {
    if (event.message.text.trim().toLowerCase() === 'ping') {
      Line_reply(event.replyToken, [Line_text('pong')]);
    }
  }
}

/** True if this webhookEventId was seen in the last 6 hours; marks it as seen otherwise. */
function Webhook_isDuplicate_(eventId) {
  if (!eventId) return false;
  const cache = CacheService.getScriptCache();
  const key = 'evt_' + eventId;
  if (cache.get(key)) return true;
  cache.put(key, '1', WEBHOOK_DEDUP_SECONDS);
  return false;
}

function Webhook_ok_() {
  return HtmlService.createHtmlOutput('OK');
}
