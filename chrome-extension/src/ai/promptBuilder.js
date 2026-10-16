// Specialized prompts per analysis mode. Never a generic "document this code".
import { CONTEXT_BEGIN, CONTEXT_END, renderContextJson, renderFiles } from './contextBuilder.js';

export const RULES = `RULES (follow exactly)
1. The source code in this message is the only source of truth. Do not use outside knowledge about what this project "probably" does.
2. Never invent files, functions, classes, components, API endpoints, tables, columns, relationships, dependencies, services, configuration or business rules. If something is not present in the provided material, write it as UNKNOWN or omit it.
3. Label every claim: "VERIFIED" = directly supported by the cited lines; "INFERRED" = a reasonable interpretation that is not directly stated; "UNKNOWN" = cannot be determined from what was provided.
4. Every VERIFIED claim MUST cite evidence: {"file", "symbol" (if any), "lineStart", "lineEnd"}. Use ONLY files listed under "filesInThisBatch". Line numbers are printed at the left of each source line ("  12| code"); do not include them in code you quote.
5. If a dependency or related file was NOT provided, do not describe what it does. Record it under "unknowns".
6. "staticFacts" were extracted by a static analyzer from the real project. Treat them as reliable but incomplete. Do not contradict them without citing evidence.
7. Reply with exactly ONE JSON object inside a single \`\`\`json code block. No prose before or after it.`;

export const SCHEMA = `RESPONSE SCHEMA (omit sections you have nothing verified for; all keys optional except at least one section)
{
  "analysisType": "<mode>",
  "files": [{ "path": "<one of filesInThisBatch>", "purpose": "...", "role": "...", "claims": [Claim], "unknowns": ["..."] }],
  "features": [{ "id": "kebab-case", "name": "...", "purpose": "...", "files": ["..."], "claims": [Claim] }],
  "workflows": [{ "id": "kebab-case", "name": "...", "purpose": "...", "api": { "method": "POST", "endpoint": "/api/x" },
      "steps": [{ "kind": "trigger|frontend|api-call|route|controller|service|logic|db-read|db-write|external-service|response", "file": "...", "symbol": "...", "description": "...", "status": "VERIFIED|INFERRED|UNKNOWN" }],
      "businessRules": [Claim], "claims": [Claim] }],
  "database": { "entities": [{ "name": "...", "purpose": "...", "fields": [{ "name": "...", "type": "...", "evidence": [Evidence] }], "claims": [Claim] }],
                "relationships": [{ "from": "...", "to": "...", "type": "one-to-many|many-to-one|one-to-one|many-to-many", "evidence": [Evidence] }] },
  "architecture": { "overview": "...", "claims": [Claim] },
  "dependencies": [{ "from": "<file>", "to": "<file>" }],
  "modules": [{ "name": "<module name from context.modules>", "purpose": "...", "howItWorks": "...",
      "features": [{ "name": "...", "description": "...", "status": "VERIFIED|INFERRED|UNKNOWN", "basedOn": ["model, route, menu, view or file names from the facts"] }],
      "keyModels": ["..."], "dependsOn": [{ "module": "...", "why": "..." }], "integrations": ["..."], "userFacing": ["menus/screens a user works with"], "claims": [Claim] }],
  "evidence": [Claim],
  "unknowns": ["..."]
}
Claim = { "claim": "one factual statement", "status": "VERIFIED|INFERRED|UNKNOWN", "subject": "the identifier the claim is about (optional)", "evidence": [Evidence] }
Evidence = { "file": "path", "symbol": "name", "lineStart": 1, "lineEnd": 5 }`;

const FILE_TASK = `TASK: FILE ANALYSIS
For each file that matters to understanding how the system works, report: purpose, role, entry points, functions/classes/components, inputs, outputs, imports, exports, dependencies, dependents, APIs, database access, state, side effects, business logic, error handling, security, related features and workflows, tests, and unknowns.
Prioritize how the code participates in workflows and data flow over describing every function. Skip trivial files.`;

const WORKFLOW_TASK = `TASK: WORKFLOW ANALYSIS
Reconstruct each workflow from the source, following the call path. Answer for each workflow, citing evidence:
- What starts this workflow? What does the user do?
- Which frontend components and functions participate? Which services execute? Which APIs are called and what data is sent?
- How is the data validated? What backend code receives it, and what business logic executes?
- Which database entities are read? Which are modified?
- What external services are called? What response is returned, how does the frontend process it, and how does the UI change?
Return each as an item in "workflows" with ordered "steps". Use the static workflow traces in staticFacts.workflows as the skeleton: confirm, refine or flag them; add "purpose" and "businessRules" only when the code shows them.`;

const DATABASE_TASK = `TASK: DATABASE ANALYSIS
Focus on: database technology, tables/collections/models, fields, primary keys, foreign keys, indexes, relationships, queries, mutations, transactions, validation, data transformations, the files that access each entity, and the features/workflows/APIs that use them.
Then describe the data flow per API: UI -> API -> service -> database operation -> entity -> relationship -> result -> API -> UI.
Only report relationships and fields visible in the provided source. Put anything else under "unknowns".`;

const FEATURE_TASK = `TASK: FEATURE ANALYSIS
Describe each feature in the selection: its components, services, APIs, workflows, database entities, tests, and related authentication/payment/order behaviour, based only on the provided files. Return "features", plus "workflows", "database" and "files" details where relevant.`;

const ARCHITECTURE_TASK = `TASK: ARCHITECTURE / PROJECT ANALYSIS
Understand the application as a system: users -> frontend -> state -> services -> APIs -> backend -> business logic -> database -> external services -> response. Identify major workflows first, then data flow, features, APIs, dependencies and architecture. Do not spend effort re-describing individual files.`;

const CHANGE_IMPACT_TASK = `TASK: CHANGE IMPACT ANALYSIS
The user describes a change (see "purpose"). Using only the provided files and staticFacts, explain which files, functions, workflows, features, APIs and database entities would be affected and what could break. Do NOT propose code. Put findings in "files", "workflows", "features" and "unknowns".`;

const CHANGE_PLAN_TASK = `TASK: CHANGE PLAN
The user describes a change (see "purpose"). First give the impact analysis as in a change-impact analysis. Then, only if you are certain the change is safe and fully determined by the provided files, include "changeProposal":
{ "title": "...", "rationale": "...", "changes": [{ "path": "<file in this batch>", "operation": "MODIFY", "edits": [{ "find": "<exact text from the file, unique, WITHOUT line numbers>", "replace": "<new text>" }] }] }
Each "find" must match the file exactly once. Never touch .env files or secrets. Never invent files that the change depends on. If unsure, omit "changeProposal" and explain in "unknowns". Your proposal is only a proposal: a human reviews the diff in VS Code before anything is applied.`;

const MODULES_TASK = `TASK: MODULE OVERVIEW (read the structure before the code)
This project is made of sub-projects (add-ons, apps, packages, services). For EVERY module in "context.modules" (they are listed in reading order: a module's dependencies come before it), read its manifest file in SOURCE FILES and its static facts, then return one item in "modules":
- purpose: what the module is for, in one or two sentences, from the manifest (name, summary, description, category) and the facts.
- features: the user-visible capabilities (e.g. "manual discount on an order line", "hold an order", "loyalty check"). Base each on concrete items in the facts (models, fields, routes, menus, views, actions, featureCandidates and their sample files); list those items in "basedOn". A feature only suggested by a name is INFERRED.
- howItWorks: how the module is put together — which models hold the data, how the UI (views/menus/screens) reaches them, which routes/controllers exist, what it changes in the modules it depends on (modelsExtended).
- keyModels: the models/tables that carry its data. dependsOn: each dependency with why it is needed (models it extends, imports). integrations: other systems or modules it talks to.
Use ONLY the manifest and the facts given. Do not describe code you were not shown; put open questions in "unknowns". Claims may cite the manifest file as evidence.`;

export function taskFor(batch) {
  const { mode, intent } = batch.context.analysis;
  if (intent === 'CHANGE_PLAN') return CHANGE_PLAN_TASK;
  if (intent === 'CHANGE_IMPACT') return CHANGE_IMPACT_TASK;
  switch (mode) {
    case 'MODULES': return MODULES_TASK;
    case 'WORKFLOW': return WORKFLOW_TASK;
    case 'DATABASE': return DATABASE_TASK;
    case 'FEATURE': return FEATURE_TASK;
    case 'PROJECT': return ARCHITECTURE_TASK;
    case 'FOLDER': return `${WORKFLOW_TASK}\n\nThen, briefly:\n${FILE_TASK}`;
    default: return FILE_TASK;
  }
}

// The user's standing instructions (VS Code setting "Additional prompt"). They shape focus and wording, never the rules.
export function userInstructions(text) {
  const t = String(text || '').trim();
  return t ? `ADDITIONAL INSTRUCTIONS FROM THE USER (follow them as long as they do not conflict with the rules above; they never allow inventing facts, files or features)\n${t.slice(0, 8000)}` : null;
}

// The prompt as ordered blocks (one block per file), so a prompt that is too large can be sent in parts without cutting a file in the middle.
export function batchPromptBlocks(batch, crossBatch) {
  const a = batch.context.analysis;
  return [
    `You are helping the "AI Project Intelligence" tool build verified, evidence-based documentation of a software project. This is batch ${batch.batchNumber} of ${batch.totalBatches} of analysis ${batch.analysisId} (mode ${a.mode}${a.purpose ? `; purpose: ${a.purpose}` : ''}). Earlier batches are summarized in "crossBatch"; you do not need any earlier chat messages.`,
    RULES,
    taskFor(batch),
    userInstructions(a.additionalInstructions),
    SCHEMA,
    `CONTEXT\n${CONTEXT_BEGIN}\n${renderContextJson(batch, crossBatch)}\n${CONTEXT_END}`,
    'SOURCE FILES',
    ...batch.context.files.map((f) => ({ text: renderFiles([f]), label: f.path })),
    'Now respond with the single JSON object in one ```json code block.',
  ].filter(Boolean).map((b) => (typeof b === 'string' ? { text: b } : b));
}

export function buildBatchPrompt(batch, crossBatch) {
  return batchPromptBlocks(batch, crossBatch).map((b) => b.text).join('\n\n');
}

// Sent in the same chat when the first answer could not be parsed or validated.
export function buildCorrectionPrompt(errors, truncated) {
  return [
    truncated ? 'Your previous reply was cut off before the JSON was complete.' : 'Your previous reply could not be used because it was not valid against the required JSON schema.',
    'Problems found:', ...errors.slice(0, 10).map((e) => `- ${e}`),
    truncated ? 'Reply again with the COMPLETE JSON object in one ```json code block. Make it shorter: keep only the most important, evidence-backed items and omit low-value claims.' : 'Reply again with ONLY the corrected JSON object in one ```json code block. Do not add new claims; fix the structure. Keep evidence and statuses honest (UNKNOWN when not determinable).',
  ].join('\n');
}
