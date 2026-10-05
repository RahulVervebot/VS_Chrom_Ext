// Renders a spec (see specBuilder) as ONE plain-text file meant to be handed to an AI (or a person) to rebuild or compare a project.
// No source code is included, only structure and evidence. Values of environment variables are never included.
const L = (n) => (n === 1 ? '' : 's');
const flag = (s) => (s && s !== 'VERIFIED' ? ` [${s}]` : '');
const kv = (o) => Object.entries(o).map(([k, v]) => `${k}: ${v}`).join(', ');

function renderSpec(spec) {
  const sections = [];
  const out = [];
  const section = (id, title, count, lines) => {
    sections.push({ id, title, count });
    out.push('', '='.repeat(78), `${sections.length}. ${title}${count !== null ? `  (${count})` : ''}`, '='.repeat(78), ...lines);
  };

  out.push(
    `PROJECT SPECIFICATION: ${spec.project.name}`,
    `Generated: ${spec.generatedAt}   Project id: ${spec.project.projectId}   Spec version: ${spec.specVersion}`,
    `Analysis coverage: ${spec.coverage.filesAnalyzed} of ${spec.coverage.filesTotal} files analysed (${spec.coverage.status})`,
    '',
    'HOW TO USE THIS FILE',
    '- This is a complete, evidence-based description of an existing project. It contains no source code.',
    '- To rebuild the project: implement every module, feature, database table/field, API endpoint, validation rule and workflow below, with the listed packages.',
    '- To compare with another project: compare section by section (features, database fields, APIs, validation, modules, environment).',
    '- Marks: no mark = found directly in the source. [INFERRED] = a reasonable reading of the code, not proven. [UNKNOWN] / "not established" = the analysis could not tell: ask, do not invent.',
    '- Do not assume anything that is not written here. Section 16 lists what is missing.',
  );

  // 1 overview
  section('overview', 'OVERVIEW', null, [
    spec.overview ? spec.overview : 'Purpose of the project: not established (no AI-verified overview yet).',
    `Languages: ${Object.keys(spec.stack.languages).length ? kv(spec.stack.languages) : 'none detected'}`,
    `Tiers: ${Object.entries(spec.architecture.tiers || {}).filter(([, v]) => v).map(([k]) => k).join(', ') || 'not established'}`,
    `Technologies: ${spec.stack.technologies.map((t) => t.name).join(', ') || 'none detected'}`,
  ]);

  // 2 required modules
  const mod = (m) => `  - ${m.name} ${m.version}${spec.stack.runtimeModules.concat(spec.stack.devModules).filter((x) => x.name === m.name).length > 1 ? `  (${m.manifest})` : ''}`;
  section('modules', 'REQUIRED MODULES (PACKAGES)', spec.stack.runtimeModules.length + spec.stack.devModules.length, [
    'Runtime dependencies:', ...(spec.stack.runtimeModules.length ? spec.stack.runtimeModules.map(mod) : ['  (none declared)']),
    'Development dependencies:', ...(spec.stack.devModules.length ? spec.stack.devModules.map(mod) : ['  (none declared)']),
    'Scripts:', ...(Object.keys(spec.stack.scripts).length ? Object.entries(spec.stack.scripts).flatMap(([file, s]) => Object.entries(s).map(([k, v]) => `  - ${k}: ${v}   (${file})`)) : ['  (none)']),
  ]);

  // 3 architecture
  const layers = Object.entries(spec.architecture.layers || {});
  section('architecture', 'ARCHITECTURE AND FOLDER STRUCTURE', layers.length, [
    ...layers.flatMap(([role, files]) => [`Layer "${role}" (${files.length} file${L(files.length)}):`, ...files.map((f) => `  - ${f}`)]),
    'Entry points:', ...((spec.architecture.entryPoints || []).length ? spec.architecture.entryPoints.map((e) => `  - ${e.path}${e.reason ? ` (${e.reason})` : ''}`) : ['  (none established)']),
    'Configuration / deployment files:', ...((spec.architecture.config || []).length ? spec.architecture.config.map((c) => `  - ${c.path}${c.kind ? ` (${c.kind})` : ''}`) : ['  (none)']),
  ]);

  // 4 features
  section('features', 'FEATURES', spec.features.length, spec.features.length ? spec.features.flatMap((f) => [
    `Feature: ${f.name}${flag(f.status)}`,
    `  Purpose: ${f.purpose || 'not established'}`,
    `  Files: ${f.files.join(', ') || 'none'}`,
    `  API endpoints: ${f.apis.join(', ') || 'none'}`,
    `  Database entities: ${f.entities.join(', ') || 'none'}`,
    `  Tests: ${f.tests.join(', ') || 'none found'}`, '',
  ]) : ['(no features detected)']);

  // 5 database
  const dbLines = [`Database technologies: ${spec.database.technologies.join(', ') || 'none detected'}`, ''];
  for (const e of spec.database.entities) {
    dbLines.push(`Table / collection: ${e.name} (${e.kind}${e.source ? `, ${e.source}` : ''})${flag(e.status)}   defined in ${e.file || 'unknown file'}`);
    if (e.purpose) dbLines.push(`  Purpose: ${e.purpose}`);
    if (!e.fields.length) dbLines.push('  Fields: not established');
    for (const f of e.fields) dbLines.push(`  - ${f.name}: ${f.type}${f.pk ? ', primary key' : ''}${f.required ? ', required' : ''}${f.unique ? ', unique' : ''}${f.rules.filter((r) => !['required', 'unique'].includes(r)).length ? `, rules: ${f.rules.filter((r) => !['required', 'unique'].includes(r)).join(' ')}` : ''}`);
    dbLines.push('');
  }
  dbLines.push('Relationships:', ...(spec.database.relationships.length ? spec.database.relationships.map((r) => `  - ${r.from} -> ${r.to} (${r.type})${r.via ? `  via ${r.via}` : ''}${flag(r.status)}`) : ['  (none established)']));
  section('database', 'DATABASE (TABLES, FIELDS, RELATIONSHIPS)', spec.database.entities.length, dbLines);

  // 6 apis
  section('apis', 'API ENDPOINTS', spec.apis.length, spec.apis.length ? [
    ...spec.apis.map((a) => `${a.key}   handler: ${a.handler || 'unknown'}   middleware: ${a.middleware.join(', ') || 'none'}${a.protected ? '   (protected)' : ''}   [${a.file}:${a.line}]`),
    '', 'Calls made by the front end:', ...(spec.clientCalls.length ? spec.clientCalls.map((c) => `  - ${c.key} from ${c.from || 'unknown'}${c.status ? ` [${c.status}]` : ''}`) : ['  (none found)']),
  ] : ['(no API endpoints detected)']);

  // 7 validation
  const byField = spec.validation.filter((v) => v.kind !== 'guard');
  const guards = spec.validation.filter((v) => v.kind === 'guard');
  section('validation', 'VALIDATION RULES', spec.validation.length, spec.validation.length ? [
    ...byField.map((v) => `  - ${v.field}: ${v.rules.join(', ')}   (${v.kind}, ${v.file}:${v.line})`),
    ...(guards.length ? ['Guards and error responses [INFERRED]:', ...guards.map((v) => `  - ${v.rules[0]}   (${v.file}:${v.line})`)] : []),
  ] : ['(no validation rules found in source; do not assume any)']);

  // 8 business rules
  section('rules', 'BUSINESS RULES (CANDIDATES)', spec.businessRules.length, spec.businessRules.length ? ['Detected from function names and structure, so all are [INFERRED]:', ...spec.businessRules.map((b) => `  - ${b.kind}: ${b.symbol}   (${b.file}:${b.line})`)] : ['(none detected)']);

  // 9 workflows
  section('workflows', 'WORKFLOWS (UI -> API -> BACKEND -> DATABASE)', spec.workflows.length, spec.workflows.length ? spec.workflows.flatMap((w) => [
    `Workflow: ${w.name}${flag(w.status)}${w.api ? `   API: ${w.api}` : ''}`,
    w.trigger ? `  Trigger: ${w.trigger.type}${w.trigger.event ? ` ${w.trigger.event}` : ''}${w.trigger.file ? ` in ${w.trigger.file}` : ''}` : '  Trigger: not established',
    ...w.steps.map((s, i) => `  ${i + 1}. ${s.kind}${s.symbol ? ` ${s.symbol}` : ''}${s.entity ? ` -> ${s.entity}${s.operation ? ` (${s.operation})` : ''}` : ''}${s.file ? `  [${s.file}]` : ''}${flag(s.status)}`),
    `  Reads: ${w.reads.join(', ') || 'none'}   Writes: ${w.writes.join(', ') || 'none'}   External services: ${w.externalServices.join(', ') || 'none'}`, '',
  ]) : ['(none traced)']);

  // 10 auth
  section('auth', 'AUTHENTICATION AND AUTHORIZATION', spec.auth.length, spec.auth.length ? spec.auth.map((a) => `  - ${a.type}: ${a.kind}   (${a.files.join(', ')})`) : ['(none found in source)']);

  // 11 external
  section('external', 'EXTERNAL SERVICES', spec.externalServices.length, spec.externalServices.length ? spec.externalServices.map((s) => `  - ${s.name}   (${s.files.join(', ')})`) : ['(none found)']);

  // 12 env
  section('environment', 'ENVIRONMENT VARIABLES (NAMES ONLY; VALUES ARE NEVER INCLUDED)', spec.environment.variables.length, spec.environment.variables.length ? spec.environment.variables.map((v) => `  - ${v.name}   (used in ${v.usedIn.join(', ')})`) : ['(none referenced)']);

  // 13 state
  section('state', 'STATE MANAGEMENT', spec.state.length, spec.state.length ? spec.state.map((s) => `  - ${s.library}   (${s.files.join(', ')})`) : ['(none found)']);

  // 14 tests
  section('tests', 'TESTS', spec.tests.length, spec.tests.length ? spec.tests.map((t) => `  - ${t}`) : ['(no test files found)']);

  // 15 build and run
  section('build', 'BUILD AND RUN', null, Object.keys(spec.stack.scripts).length ? Object.entries(spec.stack.scripts).flatMap(([file, s]) => [`${file}:`, ...Object.entries(s).map(([k, v]) => `  npm run ${k}   ->   ${v}`)]) : ['(no scripts found)']);

  // 16 unknowns
  section('unknowns', 'UNKNOWNS AND GAPS (DO NOT INVENT THESE)', spec.unknowns.length, spec.unknowns.length ? spec.unknowns.map((u) => `  - ${u}`) : ['(none recorded)']);

  return { text: `${out.join('\n')}\n`, sections };
}

module.exports = { renderSpec };
