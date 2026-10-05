const md = require('../utils/markdown');

const stepDesc = (s) => {
  switch (s.kind) {
    case 'trigger': return `User event ${md.code(s.event)} in ${md.code(s.symbol || 'component')}`;
    case 'api-call': return `${s.method} ${md.code(s.endpoint)} via ${s.client}`;
    case 'route': return `${s.method} ${md.code(s.endpoint)}`;
    case 'db-read': return `Reads ${md.code(s.entity)} (${s.operation})`;
    case 'db-write': return `Writes ${md.code(s.entity)} (${s.operation})`;
    case 'external-service': return `Calls ${s.service}`;
    case 'security-check': return `Security check: ${s.check}`;
    case 'state-change': return 'State update';
    case 'response': return 'Returns a response';
    default: return s.symbol ? md.code(s.symbol) : s.kind;
  }
};

function renderWorkflowDoc(w, generatedAt, status) {
  const k = w.knowledge || {};
  const files = w.summary.files;
  const out = [md.header({ title: `Workflow: ${w.name}`, status, sources: files, generatedAt })];
  out.push(`## Purpose\n${md.cell(k.purpose)}\n`);
  out.push(`## Trigger\n${w.trigger.type === 'UI_EVENT' ? `UI event ${md.code(w.trigger.event)} in ${md.code(w.trigger.file)} (${md.code(w.trigger.component || 'unknown component')})` : `${w.trigger.type}${w.trigger.endpoint ? ` ${w.trigger.method} ${md.code(w.trigger.endpoint)}` : ''}`}\n`);
  out.push(`## Trace (from source)\nTrace status: ${md.badge(w.status)}\n\n${md.table(['#', 'Step', 'What', 'Location', 'Evidence'], w.steps.map((s, i) => [i + 1, s.kind, stepDesc(s), s.file ? `${s.file}:${s.line}` : '', s.status]))}\n`);
  const grouped = (kinds) => w.steps.filter((s) => kinds.includes(s.kind));
  out.push(`## Frontend Flow\n${md.list(grouped(['trigger', 'frontend', 'frontend-service', 'state-change']).map((s) => stepDesc(s) + ` — ${md.loc(s.file, s.line)}`))}\n`);
  out.push(`## API Flow\n${md.list(grouped(['api-call', 'route', 'middleware']).map((s) => stepDesc(s) + ` — ${md.loc(s.file, s.line)}`))}\n`);
  out.push(`## Backend Flow\n${md.list(grouped(['controller', 'service', 'repository', 'model', 'logic']).map((s) => `${md.code(s.symbol)} — ${md.loc(s.file, s.line)} ${md.badge(s.status)}`))}\n`);
  out.push(`## Database Flow\n${md.table(['Entity', 'Operation', 'Kind', 'Location', 'Evidence'], grouped(['db-read', 'db-write']).map((s) => [s.entity, s.operation, s.kind === 'db-write' ? 'write' : 'read', `${s.file}:${s.line}`, s.status]))}\n`);
  out.push(`## External Services\n${md.list(w.summary.externalServices)}\n`);
  out.push(`## Business Rules\n${md.table(['Rule', 'Status', 'Evidence'], (k.businessRules || []).map((c) => [c.claim, c.status, (c.evidence || []).map((e) => `${e.file}${e.symbol ? '#' + e.symbol : ''}`).join('; ')]))}\n`);
  out.push(`## Error Handling and Security\n${md.list(grouped(['security-check']).map((s) => `${s.check} at ${md.loc(s.file, s.line)}`), '_No security checks found on this path._')}\n`);
  out.push(`## Files\n${md.list(files.map(md.code))}\n`);
  out.push(`## AI-Provided Steps\n${md.table(['Step', 'Symbol', 'Description', 'Status'], (k.steps || []).map((s) => [s.kind || '', s.symbol || '', s.description || '', s.status]))}\n`);
  out.push(`## Unknowns\n${md.list([...(w.unknowns || [])])}\n`);
  return out.join('\n');
}

module.exports = { renderWorkflowDoc };
