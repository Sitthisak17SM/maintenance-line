// LINE webhook (PLAN §7). URL: {API_URL}?key={WEBHOOK_KEY}. Keep it light: one sheet write and one reply per event.

const WEBHOOK_DEDUP_SECONDS = 6 * 3600;
const WEBHOOK_PAYLOAD_MAX_CHARS = 49000; // sheet cell limit is 50,000
const WEBHOOK_ENV_CACHE_SECONDS = 600; // a Config ENV change takes up to 10 min to apply
const WEBHOOK_TRACE_LINES = 20;
const WEBHOOK_JOB_ID_RE = /^[A-Za-z0-9]+-\d{4}-\d{4}$/;

function Webhook_handle(e) {
  const expected = (PropertiesService.getScriptProperties().getProperty('WEBHOOK_KEY') || '').trim();
  if (!expected || String(e.parameter.key).trim() !== expected) {
    Webhook_trace_(expected
      ? 'key mismatch (got ' + String(e.parameter.key).length + ' chars, expected ' + expected.length + ')'
      : 'WEBHOOK_KEY is not set');
    return Webhook_ok_();
  }

  let events = [];
  try {
    events = JSON.parse(e.postData.contents).events || [];
  } catch (err) {
    Webhook_trace_('invalid body');
    return Webhook_ok_();
  }
  // The console's Verify button sends no events; answer before touching the sheet.
  if (!events.length) return Webhook_ok_();

  const isTest = Webhook_env_() === 'test';
  events.forEach(function (event) {
    try {
      Webhook_handleEvent_(event, isTest);
    } catch (err) {
      Webhook_trace_('event ' + event.webhookEventId + ' failed: ' + (err.stack || err));
    }
  });
  return Webhook_ok_();
}

function Webhook_handleEvent_(event, isTest) {
  if (Webhook_isDuplicate_(event.webhookEventId)) {
    Webhook_trace_('duplicate event ' + event.webhookEventId + ' skipped');
    return;
  }
  Webhook_trace_(event.type + ' event from ' + (event.source && event.source.type));

  try {
    Webhook_respond_(event);
  } finally {
    // Log even when the reply fails, so the event is still visible in WebhookLog.
    if (isTest) {
      Repo_append('WebhookLog', {
        at: new Date(),
        event_type: event.type,
        user_id: (event.source && event.source.userId) || '',
        webhook_event_id: event.webhookEventId || '',
        payload: JSON.stringify(event).slice(0, WEBHOOK_PAYLOAD_MAX_CHARS),
      });
    }
  }
}

function Webhook_respond_(event) {
  if (!event.source || event.source.type !== 'user') return;
  const userId = event.source.userId;
  if (event.type === 'follow') {
    Webhook_reply_(event, function () { return Flex_welcome(); });
    Jobs_setUserActive(userId, true); // re-following reactivates a registered user
  } else if (event.type === 'unfollow') {
    Jobs_setUserActive(userId, false);
  } else if (event.type === 'message' && event.message.type === 'text') {
    Webhook_reply_(event, function () { return Webhook_textReply_(userId, event.message.text.trim()); });
  } else if (event.type === 'postback') {
    Webhook_reply_(event, function () { return Webhook_postbackReply_(userId, Webhook_parseQuery_(event.postback.data)); });
  }
}

function Webhook_textReply_(userId, text) {
  if (text.toLowerCase() === 'ping') return Line_text('pong');
  if (WEBHOOK_JOB_ID_RE.test(text)) {
    // Sent by liff.sendMessages after report.html submits; only the reporter gets the card.
    const found = Repo_findJob(text);
    if (found && String(found.job.reporter_id).trim() === userId) return Flex_jobReceived(found.job, Jobs_ref_(found.job));
    return Flex_help();
  }
  if (text === 'งานของฉัน') {
    return Webhook_asActor_(userId, function (actor) {
      const mine = Jobs_myOpen(actor);
      return Flex_myJobs(mine.jobs, mine.total);
    });
  }
  return Flex_help();
}

/** Postback data is a querystring: a=accept|ack|ext_ok|ext_no, j=job id (PLAN §7). */
function Webhook_postbackReply_(userId, q) {
  if (q.a === 'accept') {
    return Webhook_asActor_(userId, function (actor) {
      try {
        return Flex_acceptResult(Jobs_accept(actor, q.j).job);
      } catch (err) {
        if (!err.code) throw err;
        return Flex_acceptResult(null, err.message);
      }
    });
  }
  if (q.a === 'ack') {
    return Webhook_asActor_(userId, function (actor) {
      try {
        return Flex_ackResult(Jobs_ack(actor, q.j).job);
      } catch (err) {
        if (!err.code) throw err;
        return Flex_ackResult(null, err.message);
      }
    });
  }
  if (q.a === 'ext_ok' || q.a === 'ext_no') return Line_text('การอนุมัติขอเลื่อนยังไม่เปิดใช้งาน');
  return Flex_help();
}

/** Runs fn with the registered, active actor; otherwise replies with the register card. */
function Webhook_asActor_(userId, fn) {
  let actor;
  try {
    actor = Jobs_actor(userId);
  } catch (err) {
    if (err.code === 'NOT_REGISTERED') return Flex_notRegistered();
    if (err.code) return Line_text(err.message);
    throw err;
  }
  return fn(actor);
}

/** Builds the reply with buildFn and sends it; an unexpected error still gets a short reply. */
function Webhook_reply_(event, buildFn) {
  let message;
  try {
    message = buildFn();
  } catch (err) {
    Webhook_trace_('handler failed: ' + (err.stack || err));
    message = Line_text('ระบบขัดข้อง กรุณาลองใหม่อีกครั้ง');
  }
  Webhook_traceReply_(Line_reply(event.replyToken, [message]));
}

function Webhook_parseQuery_(data) {
  const out = {};
  String(data || '').split('&').forEach(function (pair) {
    const i = pair.indexOf('=');
    if (i <= 0) return;
    try {
      out[decodeURIComponent(pair.slice(0, i))] = decodeURIComponent(pair.slice(i + 1).replace(/\+/g, ' '));
    } catch (err) {
      // ignore malformed pairs
    }
  });
  return out;
}

/** Config ENV, cached so most webhook calls skip opening the sheet. */
function Webhook_env_() {
  const cache = CacheService.getScriptCache();
  let env = cache.get('cfg_env');
  if (env === null) {
    try {
      env = String(Repo_getConfig().ENV || '');
    } catch (err) {
      Webhook_trace_('cannot read Config: ' + err);
      return '';
    }
    cache.put('cfg_env', env, WEBHOOK_ENV_CACHE_SECONDS);
  }
  return env;
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

function Webhook_traceReply_(res) {
  Webhook_trace_(res.ok ? 'reply sent' : 'reply failed: HTTP ' + res.status + ' ' + res.body);
}

/**
 * Logs a webhook step. Web App runs triggered by LINE do not show console output in the
 * editor, so the last lines are also kept in the script cache for Setup_check().
 */
function Webhook_trace_(message) {
  console.log('Webhook: ' + message);
  const cache = CacheService.getScriptCache();
  const lines = JSON.parse(cache.get('diag_webhook') || '[]');
  lines.push(Utilities.formatDate(new Date(), 'Asia/Bangkok', 'HH:mm:ss') + ' ' + String(message).slice(0, 500));
  cache.put('diag_webhook', JSON.stringify(lines.slice(-WEBHOOK_TRACE_LINES)), WEBHOOK_DEDUP_SECONDS);
}

function Webhook_ok_() {
  return HtmlService.createHtmlOutput('OK');
}
