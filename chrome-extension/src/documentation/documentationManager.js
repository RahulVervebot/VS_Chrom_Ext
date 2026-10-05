// DOCUMENTATION_REQUEST -> specialized prompt -> markdown. Output is an unverified DRAFT; VS Code stores it next to (never over) generated docs.
import { RULES } from '../ai/promptBuilder.js';
import { workflowDocPrompt } from './workflowDocumentation.js';
import { databaseDocPrompt } from './databaseDocumentation.js';
import { featureDocPrompt } from './featureDocumentation.js';
import { architectureDocPrompt } from './architectureDocumentation.js';

const BY_KIND = { workflow: workflowDocPrompt, database: databaseDocPrompt, feature: featureDocPrompt, architecture: architectureDocPrompt };

export function buildDocumentationPrompt(payload) {
  const kind = payload.kind || 'architecture';
  const section = (BY_KIND[kind] || architectureDocPrompt)();
  return [
    'You are writing documentation for the "AI Project Intelligence" tool from verified project knowledge (below). Write for developers new to the project.',
    RULES.split('\n').filter((l) => !/^7\./.test(l)).join('\n'),
    section,
    'OUTPUT: reply with one JSON object in a ```json code block: { "key": "<the key given>", "markdown": "<the document in Markdown>" }. In the Markdown, mark unverifiable statements with (INFERRED) or UNKNOWN and never state anything not present in the knowledge.',
    `KEY: ${payload.key}`,
    `KNOWLEDGE\nBEGIN_CONTEXT_JSON\n${JSON.stringify(payload.knowledge || payload.context || {})}\nEND_CONTEXT_JSON`,
  ].join('\n\n');
}

export function validateDocumentationResponse(value, key) {
  if (!value || typeof value.markdown !== 'string' || !value.markdown.trim()) return { ok: false, errors: ['"markdown" must be a non-empty string'] };
  return { ok: true, doc: { key, markdown: value.markdown } };
}
