// External services are reported only when source/configuration evidence supports them.
const { lineIndex, lineAt } = require('../utils/text');

const SERVICES = [
  { name: 'Stripe', re: /\bstripe\b|api\.stripe\.com|Stripe\(/i },
  { name: 'PayPal', re: /paypal/i },
  { name: 'AWS', re: /aws-sdk|@aws-sdk|boto3|amazonaws\.com|\bS3Client\b|new\s+AWS\./ },
  { name: 'Google APIs', re: /googleapis|google-auth|maps\.googleapis\.com|@google-cloud/ },
  { name: 'Firebase', re: /firebase/i },
  { name: 'Twilio', re: /\btwilio\b/i },
  { name: 'SendGrid', re: /sendgrid/i },
  { name: 'Mail (SMTP)', re: /nodemailer|createTransport\(|smtplib|Mail::send|PHPMailer|wp_mail\(/ },
  { name: 'Cloudinary', re: /cloudinary/i },
  { name: 'Analytics', re: /google-analytics|gtag\(|mixpanel|segment\.com|analytics\.track|amplitude|posthog/i },
  { name: 'Sentry', re: /@sentry\/|sentry_sdk|Sentry\.init/ },
  { name: 'Maps', re: /mapbox|leaflet|google\.maps|maps\.googleapis/i },
  { name: 'Slack', re: /slack\.com\/api|@slack\/|hooks\.slack\.com/i },
  { name: 'OpenAI/LLM API', re: /api\.openai\.com|api\.anthropic\.com|from\s+['"]openai['"]/ },
];

function analyzeExternalServices(content) {
  const starts = lineIndex(content);
  const out = [];
  for (const s of SERVICES) {
    const re = new RegExp(s.re.source, s.re.flags.includes('i') ? 'gi' : 'g');
    const lines = [];
    let first = null;
    let m;
    while ((m = re.exec(content)) && lines.length < 30) {
      if (!first) first = m;
      const ln = lineAt(starts, m.index);
      if (lines[lines.length - 1] !== ln) lines.push(ln);
    }
    if (first) out.push({ name: s.name, line: lines[0], lines, match: first[0].slice(0, 40) });
  }
  const hosts = new Set();
  for (const m of content.matchAll(/https?:\/\/([a-z0-9.-]+\.[a-z]{2,})(?:[/:'"`?]|$)/gi)) {
    const h = m[1].toLowerCase();
    if (!/^(localhost|127\.0\.0\.1|example\.(com|org)|www\.w3\.org|schemas\.|json-schema\.org)/.test(h)) hosts.add(h);
  }
  return { services: out, hosts: [...hosts].sort() };
}

module.exports = { analyzeExternalServices };
