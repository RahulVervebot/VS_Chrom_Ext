# Changelog

## 0.5.0
- **Reading order** (`aiProject.readFirst` / `aiProject.readLast`, Scan page). Broad analyses follow it, and each add-on's manifest is read before its code. Runs record their order, so a resume rebuilds exactly the same batches.
- **Module overview stage** (`aiProject.moduleOverviewFirst`):
  - Add-on and package manifests go out in dependency order, with their static facts.
  - The AI's purpose, features and how-it-works for each module are verified against the facts and stored in `.ai-project/modules/`.
  - The overview appears on the Modules page and in the specification, and is used as context for later file runs.
- **Additional prompt** (`aiProject.additionalPrompt`): the user's standing instructions, sent with every AI request.
- **Compare:**
  - A new "Features per module (AI overview)" category.
  - Databases are now listed in the stack.
  - An optional "which is better" assessment per area, with reasons and no scores (`aiProject.compareAssessment`).
- **Odoo feature grouping:**
  - Features inside an add-on are grouped by model and screen name.
  - Extensions of other add-ons' models become integration features.
  - Vendor libraries and generic UI parts are no longer listed as features.
- **Fixes:**
  - Python `from x import y` and prose such as "the JOIN clause" are no longer detected as SQL tables.
  - Scans of large Odoo trees are about 15× faster (regexes no longer backtrack catastrophically).
  - Odoo `TransientModel` is no longer reported as an entity.

## 0.1.0
- Initial build: extension shell, scanner, analyzers, .ai-project store.
