import { RULES } from '../ai/promptBuilder.js';

export const BLUEPRINT_SECTIONS = ['purpose', 'technologyStack', 'architecture', 'modules', 'features', 'workflows', 'database', 'apis', 'businessRules', 'externalServices', 'authentication', 'authorization', 'stateManagement', 'folderStructure', 'components', 'services', 'models', 'environmentRequirements', 'commands', 'conflicts'];

export function blueprintPrompt(payload) {
  return [
    'You are producing a PROJECT BLUEPRINT (a planning document, not code) for the "AI Project Intelligence" tool, combining the knowledge of the reference projects with the user requirements.',
    RULES.split('\n').filter((l) => !/^[47]\./.test(l)).join('\n'),
    'BLUEPRINT RULES: Base decisions on the reference projects and requirements only. If the projects disagree, do NOT choose silently: add an entry to "conflicts" ({ "topic", "options": [{ "project", "approach" }], "requiresDecision": "..." }). Never describe environment values or secrets. "folderStructure" is a nested object: keys are folder/file names, folders map to objects, files to null.',
    `OUTPUT: one JSON object in a \`\`\`json block with keys: ${BLUEPRINT_SECTIONS.join(', ')}.`,
    ...(payload.specs && payload.specs.length ? ['SPECIFICATIONS: each reference project is described by a full specification (features, database fields, validation, required modules, APIs, workflows, environment). Treat the specifications as the authoritative description of those projects. Items marked [INFERRED] or "not established" are uncertain: put them in "conflicts" or note them, do not present them as facts.'] : []),
    ...(payload.gaps && payload.gaps.length ? ['GAPS BETWEEN THE PROJECTS (computed, factual): use them to decide what the new project should include. For every item that only one project has, state in the blueprint whether it is included and why; for every item that differs, record the choice in "conflicts" with "requiresDecision".'] : []),
    `REQUIREMENTS\n${payload.requirements}`,
    `BEGIN_CONTEXT_JSON\n${JSON.stringify({ projects: payload.projects, ...(payload.specs && payload.specs.length ? { specifications: payload.specs } : {}), ...(payload.gaps && payload.gaps.length ? { gaps: payload.gaps } : {}) })}\nEND_CONTEXT_JSON`,
  ].join('\n\n');
}

export function validateBlueprint(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return { ok: false, errors: ['blueprint must be an object'] };
  const present = BLUEPRINT_SECTIONS.filter((k) => value[k] !== undefined);
  if (present.length < 4) return { ok: false, errors: [`blueprint has only ${present.length} recognized sections`] };
  return { ok: true, blueprint: Object.fromEntries(present.map((k) => [k, value[k]])) };
}
