import { RULES, userInstructions } from '../ai/promptBuilder.js';

export const SECTIONS = ['commonApproaches', 'differences', 'architecturalDifferences', 'databaseDifferences', 'workflowDifferences', 'reusablePatterns', 'migrationConsiderations', 'unknowns'];
const FORBIDDEN = new Set(['score', 'scores', 'rank', 'ranking', 'winner', 'best', 'overallScore', 'rating']);

export const strip = (v) => (Array.isArray(v) ? v.map(strip) : v && typeof v === 'object' ? Object.fromEntries(Object.entries(v).filter(([k]) => !FORBIDDEN.has(k)).map(([k, x]) => [k, strip(x)])) : v);

// "Which is better": a judgement per area with reasons and trade-offs, never a number, and "depends" when it honestly depends.
const ASSESS_RULE = 'ASSESSMENT: The user also wants to know which project is better, area by area. In "assessment", give one item per area that matters (for example: features, a specific feature such as discounts or loyalty, data model, validation, architecture/structure, technology/language and database, security, testability, maintainability). For each: "verdict" = the name of the project that is stronger in that area, or "both equal", or "depends" (then say on what); "reasons" = concrete facts from the provided specifications/knowledge that support it; "tradeoffs" = what the other project does better or what the choice costs; "basedOn" = the spec sections or items used. Judge only from what is provided; if an area is not established for one project, say so instead of judging it. Then "summary": two or three sentences on which project fits which needs. No numeric scores, ratings or rankings.';

export function comparisonPrompt(payload, focus) {
  return [
    `You are comparing software projects for the "AI Project Intelligence" tool. ${focus}`,
    RULES.split('\n').filter((l) => !/^[47]\./.test(l)).join('\n'),
    payload.assess
      ? 'COMPARISON RULES: Report documented structural differences and their implications. Where the projects disagree on a fact, add it to "conflicts" instead of choosing. Anything not established by the provided knowledge goes in "unknowns". No numeric scores or ratings.'
      : 'COMPARISON RULES: Do not score, rank or declare a winner. Do not say one design is universally better. Report documented structural differences and their implications. Where the projects disagree on a fact, add it to "conflicts" instead of choosing. Anything not established by the provided knowledge goes in "unknowns".',
    ...(payload.assess ? [ASSESS_RULE] : []),
    ...(payload.scopes ? ['SCOPE RULE: The user picked only one part of each project. Compare ONLY those parts: the files listed in "scopes" and the data in projects[] (files, symbols, APIs, database use, workflows, documents). Do not describe the rest of either project, and do not treat the absence of anything outside the scope as a difference. Say which project each statement is about, cite files or document keys, and put anything the provided scope does not establish in "unknowns". If a part has files without documentation (undocumentedFiles), say the documentation for it is missing instead of guessing.'] : []),
    ...(userInstructions(payload.additionalInstructions) ? [userInstructions(payload.additionalInstructions)] : []),
    `OUTPUT: one JSON object in a \`\`\`json block: { ${SECTIONS.map((s) => `"${s}": ["..."]`).join(', ')}, "conflicts": [{ "topic": "...", "claims": [{ "project": "...", "claim": "...", "evidence": "..." }], "affectedAreas": ["..."] }]${payload.assess ? ', "assessment": [{ "area": "...", "verdict": "<project name> | both equal | depends", "reasons": ["..."], "tradeoffs": ["..."], "basedOn": ["spec section or item"] }], "summary": "..."' : ''} }`,
    `KIND: ${payload.kind}\nBEGIN_CONTEXT_JSON\n${JSON.stringify({ kind: payload.kind, ...(payload.scopes ? { scopes: payload.scopes } : {}), ...(payload.ref ? { ref: payload.ref } : {}), projects: payload.projects, structuralFacts: payload.structural, selection: payload.selection })}\nEND_CONTEXT_JSON`,
  ].join('\n\n');
}

export function validateComparison(value) {
  if (!value || typeof value !== 'object') return { ok: false, errors: ['result must be an object'] };
  const clean = strip(value);
  const result = {};
  for (const s of SECTIONS) result[s] = Array.isArray(clean[s]) ? clean[s] : [];
  if (SECTIONS.every((s) => result[s].length === 0)) return { ok: false, errors: ['none of the comparison sections contain content'] };
  if (Array.isArray(clean.assessment)) {
    const txt = (v) => (typeof v === 'string' ? v : v === null || v === undefined ? '' : JSON.stringify(v));
    const list = (v) => (Array.isArray(v) ? v : v ? [v] : []).map(txt).filter(Boolean).slice(0, 20);
    result.assessment = clean.assessment.filter((a) => a && typeof a === 'object' && a.area).slice(0, 40).map((a) => ({ area: txt(a.area).slice(0, 200), verdict: txt(a.verdict || 'depends').slice(0, 200), reasons: list(a.reasons), tradeoffs: list(a.tradeoffs), basedOn: list(a.basedOn) }));
  }
  if (typeof clean.summary === 'string' && clean.summary.trim()) result.summary = clean.summary.slice(0, 4000);
  return { ok: true, result, conflicts: Array.isArray(clean.conflicts) ? clean.conflicts : [] };
}

export const FOCUS = {
  PROJECT: 'Compare the whole projects: technology, architecture, folder structure, features, workflows, database, APIs, frontend/backend/data flow, business rules, authentication, authorization, state management, dependencies, external services, testing, security and deployment.',
  FEATURE: 'Compare the same feature across the projects: user flow, frontend, backend, API, database, data flow, business rules, error handling, security, testing, dependencies and external services.',
  WORKFLOW: 'Compare the workflow across the projects: trigger, frontend flow, API flow, backend flow, database flow, business rules, external services, error handling, security, testing and dependencies.',
  DATABASE: 'Compare the database designs: technology, schema, entities, relationships, normalization, queries, transactions, indexes, data ownership and feature relationships. Do not declare one design better.',
  DOCUMENTATION: 'Compare the projects\' generated documentation documents (project overview, architecture, features, workflows, database). The documents are provided as text excerpts in projects[].documents; "structuralFacts" lists which documents exist in each project and which were truncated or not sent. Compare what the documents say about purpose, architecture, features, workflows, data model, APIs, security and testing, and where the documents of the two projects disagree or leave gaps. Cite the document key for each point.',
  SPEC: 'You are given the full project specifications (projects[].specText) of two projects and a computed comparison (structuralFacts.comparisonText) that lists, per area, what both projects have, what only one has, and what differs. Use ONLY these. Explain in plain language: (1) what is common, (2) what the first project has that the second does not, (3) what the second has that the first does not, (4) where they conflict, and (5) which of the second project\'s items the first project could consider adopting and which of its own it should keep, each with the reason and the spec section it comes from. Do not repeat the lists item by item; explain what they mean. Treat [INFERRED] and "not established" items as uncertain.',
  ARCHITECTURE: 'Compare the architectures: layers, technology, folder structure, dependency structure and deployment.',
};
