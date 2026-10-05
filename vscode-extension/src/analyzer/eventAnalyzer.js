// Events, queues, jobs, webhooks, and test file detection.
const { lineIndex, lineAt } = require('../utils/text');

function analyzeEvents(content) {
  const starts = lineIndex(content);
  const res = { events: [], queues: [], jobs: [], webhooks: [] };
  let m;
  const emit = /\b([\w$.]+)\.emit\(\s*['"`]([\w:.-]+)['"`]/g;
  while ((m = emit.exec(content))) res.events.push({ name: m[2], role: 'emit', line: lineAt(starts, m.index) });
  const on = /\b(?!app\b|router\b)([\w$.]+)\.(?:on|once|addListener)\(\s*['"`]([\w:.-]+)['"`]/g;
  while ((m = on.exec(content))) if (!['click', 'change', 'submit', 'keydown', 'load', 'error', 'close', 'data', 'end', 'open', 'message', 'connection'].includes(m[2]) || /io|socket|emitter|events/i.test(m[1])) res.events.push({ name: m[2], role: 'listen', line: lineAt(starts, m.index) });
  const q = /new\s+(?:Bull|BullMQ|Queue|Worker)\(\s*['"`]([\w:-]+)['"`]|\b(?:celery|Celery)\(|@(?:shared_task|app\.task)|sqs\.(?:sendMessage|receiveMessage)|Queue::push|dispatch\(/g;
  while ((m = q.exec(content))) res.queues.push({ name: m[1] || null, line: lineAt(starts, m.index), match: m[0].slice(0, 30) });
  const job = /cron\.schedule\(\s*['"`]([^'"`]+)['"`]|node-cron|agenda\.define\(\s*['"`]([\w:-]+)['"`]|@Cron\(|schedule\.every|wp_schedule_event|\$schedule->|@Scheduled\(/g;
  while ((m = job.exec(content))) res.jobs.push({ name: m[2] || m[1] || null, line: lineAt(starts, m.index), match: m[0].slice(0, 30) });
  const wh = /['"`](\/[\w/-]*webhooks?[\w/-]*)['"`]|constructEvent\(|X-Hub-Signature|stripe-signature/gi;
  while ((m = wh.exec(content))) res.webhooks.push({ path: m[1] || null, line: lineAt(starts, m.index), match: m[0].slice(0, 30) });
  return res;
}

const TEST_PATH = /(^|\/)(__tests__|tests?|spec|e2e)\/|\.(test|spec)\.[a-z]+$|(^|\/)test_[\w]+\.py$|_test\.(go|py|rb)$|Test\.(java|php)$/;
function isTestFile(path) { return TEST_PATH.test(path); }

module.exports = { analyzeEvents, isTestFile };
