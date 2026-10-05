# AI Project Intelligence (VS Code extension)

The **source-of-truth** half of the system. It reads your real project, builds a persistent `.ai-project/` knowledge base, prepares secret-free context for the Chrome extension, and checks everything the AI returns against your actual source code.

It works together with the **AI Project Bridge** Chrome extension (the `chrome-extension` folder), which talks to ChatGPT, Claude or Gemini in your own browser tab.

---

## Quick start

### 1. Build and install

You need Node.js 18+ and VS Code 1.85+.

```bash
cd vscode-extension
npm i
npm run build
npx @vscode/vsce package --allow-missing-repository
```

This creates `ai-project-intelligence-0.1.0.vsix` in the same folder.

> If `npm i` fails with a permission error on `~/.npm`, add `--cache /tmp/npm-cache`.

Install the `.vsix` in VS Code:

1. Open the **Extensions** panel (Cmd+Shift+X on Mac, Ctrl+Shift+X on Windows/Linux).
2. Click the **`···`** menu at the top right of that panel.
3. Choose **Install from VSIX…** and select `ai-project-intelligence-0.1.0.vsix`.
4. Reload VS Code if it asks.

(Command line alternative: `code --install-extension ai-project-intelligence-0.1.0.vsix`.)

### 2. Open your project

**File → Open Folder…** and choose the project you want to analyze. Open the folder itself, not a single file.

### 3. Open AI Project

Either of these:

- Click **`AI Project`** (rocket icon) in the **status bar**, bottom-left of the window.
- Or click the **AI Project Intelligence** icon (a small three-node graph) in the **Activity Bar** on the far left. This opens the sidebar with a **Getting started** card at the top.

You can also press Cmd/Ctrl+Shift+P and run **AI Project: Start Here (guided)**.

Both show the same five-step checklist. The arrow marks the next step. Pick a step and it runs; the list then comes back so you can continue.

### 4. The five steps

| Step | What it does | What you will see |
|---|---|---|
| **1. Set up this project** | Creates a `.ai-project/` folder inside your project. It holds everything the extension learns: file index, workflows, database notes, documentation, analysis history. It asks for a project name. Running it again never overwrites anything. | A `.ai-project` folder appears in the Explorer. |
| **2. Scan the code** | Reads your real files (skipping `node_modules`, `.git`, `dist`, `build`, `.next`, `coverage`, `.env`, `*.log` by default). It hashes every file, detects languages, and finds functions, imports, dependencies, API routes, database usage, workflows and features. **No AI is used in this step.** Run it again after you edit code: changed files are flagged **OUTDATED**. | A message such as "scan complete: 120 files". Dashboard counts fill in. Coverage shows **NOT ANALYZED**, which is correct because no AI has looked at anything yet. |
| **3. Choose what to analyze** | Decides what will be sent to the AI. Pick **The entire project**, **A folder…** or **Specific files…**. You can also right-click a file or folder in the Explorer and choose **AI Project: Select Files / Select Folder**. Related files (imports and dependents) are added automatically for context. | "Selected: 1 folders" (or files / entire project). |
| **4. Connect Chrome (once)** | Pairs VS Code with the Chrome extension. See below. | A 12-character code. |
| **5. Analyze with AI** | Builds the context for your selection, removes secrets, splits it into batches if it is large, and shows a **privacy summary**: number of files, batches, estimated tokens and secrets removed. Nothing is sent until you click **Send**. Chrome then asks for a second approval. | The summary dialog, then progress in the sidebar. |

### 5. Pair with Chrome (one time)

Prerequisite: the Chrome extension is loaded (`chrome://extensions` → Developer mode → Load unpacked → the `chrome-extension` folder, after `npm i && npm run build` there), and you have ChatGPT, Claude or Gemini open and logged in in a tab.

1. In VS Code run step **4. Connect Chrome** (or the command **AI Project: Pair Chrome**). A **pairing code** such as `47821-7K3M9QX2LPWA` appears. It is valid for 2 minutes and works once.
2. In Chrome click the **AI Project Bridge** icon to open its side panel, go to the **Connection** tab, paste the whole code (it looks like `47821-7K3M9QX2LPWA`; the number in front is the port), and click **Pair**.
3. Back in VS Code a dialog asks **"Allow … to connect?"** Click **Allow**. Only approve pairing you started yourself.
4. The status bar shows the Chrome connection, and the Chrome panel shows a green dot. From now on Chrome reconnects automatically; you do not pair again.

### 6. Run your first analysis

1. Pick a small selection in step 3, for example one folder.
2. Choose step **5. Analyze with AI**, optionally type what to focus on (for example "how does checkout work"), and click **Send** on the privacy summary.
3. In the Chrome panel open the **Analysis** tab, check the review, and click **Send and analyze**.
4. Wait. Chrome types each batch into your AI tab, validates the answer, and saves a checkpoint after every batch. Progress shows in both windows.
5. When it finishes, run **AI Project: Generate Documentation** and look at the sidebar pages **Workflows**, **Database**, **Features**, **Architecture** and **Documentation**, or open `.ai-project/architecture/overview.md`.

Analyzing another folder later merges into the same project as a new analysis; nothing is duplicated or overwritten.

### Switching to another project

You can only work with one project at a time per Chrome. To stop one and start another:

1. **Let the current analysis stop safely.** In the Chrome panel (**Analysis** tab) click **Pause** or **Stop** if one is running. You can also just carry on to step 2: the unfinished analysis is **paused automatically and keeps all its progress**. Completed batches are never lost or repeated.
2. **Open the other project in VS Code** (File → Open Folder… in the same window, or a new window) and click **`AI Project`** in the status bar.
3. Do the steps for that project: set up, scan, choose what to analyze, then **4. Connect Chrome**. A new pairing code appears, like `47822-7K3M9QX2LPWA`.
4. In Chrome open the **Connection** tab. If it says *CONNECTED* you will see **Working on another project?** Paste the new code there and press **Switch to that project**. (If it is not connected, paste the code in the Pair box.) Then press **Allow** in VS Code.

Chrome is now connected to the new project. The old project is not touched.

**Coming back later to finish the first project:** open it in VS Code, click `AI Project` → **4. Connect Chrome**, paste the code in Chrome as above, then run **AI Project: Resume Analysis** and pick the analysis. It continues from its last checkpoint. Anything Chrome finished in the meantime is delivered to the right project automatically and never to the wrong one.

**To stop listening without switching:** run **AI Project: Disconnect Chrome** and choose *Disconnect* (Chrome can reconnect without a new code), *Disconnect and forget pairing* (a new code is needed), or *Stop bridge* (VS Code stops listening on its port).

**Several VS Code windows at once** is fine. The first uses port `47821`; the next automatically uses `47822`, and so on. The port is part of the pairing code, so you never type it.

### What the labels mean

- **VERIFIED**: VS Code found the cited evidence (file, symbol, lines) in your real source.
- **INFERRED**: a reasonable interpretation the source does not state directly.
- **UNKNOWN**: could not be established. Never guessed.
- File status **NOT_ANALYZED / ANALYZED / PARTIAL / OUTDATED**: OUTDATED means the file changed after it was analyzed.

---

## Everyday commands

Cmd/Ctrl+Shift+P, then type "AI Project".

| Command | Use it to |
|---|---|
| Start Here (guided) | Show the checklist above |
| Scan Project | Refresh the index after editing code |
| Select Files / Select Folder | Choose what to analyze (also in the Explorer right-click menu) |
| Analyze Selection / Workflows / Database / Feature / Dependencies | Send a selection, a traced workflow, database entities, a feature, or a file with its dependencies to the AI |
| Generate / Update / Rebuild Documentation | Write documents into `.ai-project/` from verified knowledge |
| Show Architecture / Workflow / Database Flow / Dependency Graph | Open those views |
| Compare Projects / Features / Workflows / Databases | Compare with other analyzed projects (no scores or rankings) |
| Selection scope | With files/folders/a feature selected, the Architecture, Database, Features, Workflows and Dependencies pages show only that part; **Show entire project** switches back |
| Export Project Specification | Writes one text file with features, database fields, validation, required modules, APIs, workflows and unknowns (`.ai-project/exports/project-spec.txt`) |
| Compare Project Specifications (instant / + Ask AI) | Compares two projects' specification files: common, only in one, different; plus blueprint suggestions |
| Compare Selected Files / Feature | Compare only the files (or feature/workflow) you selected with the matching part of another project |
| Compare Documentation | Compare the generated documentation of this project with another project's (run Update Documentation in both first) |
| Generate Project Blueprint / Create Project From Blueprint | Plan a new project (plans only) |
| Analyze Change / Generate Change Plan / Review AI Changes / Apply AI Changes | Safe code changes: you review the diff, files must be unchanged since analysis, then checks run |
| Verify Project | Run the project's own test / lint / typecheck / build commands |
| Pair Chrome / Connect Chrome / Disconnect Chrome / Show Chrome Status | Manage the Chrome connection |
| Resume Analysis | Continue an interrupted analysis from its last checkpoint |
| Configure Exclusions | Choose what is never scanned or sent (presets for Node, React, Next.js, Python, PHP, Laravel, WordPress, Java, .NET) |

## Troubleshooting

| Problem | Fix |
|---|---|
| No `AI Project` item in the status bar | Open a project **folder** (File → Open Folder…). Then reload the window. |
| Command says "Initialize Project first" | Run step 1. |
| Sidebar shows nothing about workflows | Run step 2 (scan). |
| Chrome says it cannot reach VS Code | Run **Pair Chrome** in VS Code and paste the new code, including the number in front. |
| I paired to another project and the first one stopped | Expected: one project at a time. Its progress is kept; reconnect it and run **Resume Analysis**. |
| Pairing code rejected or expired | Codes last 2 minutes and work once. Run **Pair Chrome** again. |
| Analysis sits waiting | It is waiting for you to click **Send and analyze** in the Chrome panel. |
| Port already in use | Handled automatically: the next free port is used and included in the pairing code. |
| Anything else | View → Output → **AI Project Intelligence** shows the log. |

---

## Development
| Script | Purpose |
|---|---|
| `npm run build` / `watch` | esbuild bundles `dist/extension.js` (Node) and `dist/webview.js` + `webview.css` (React UI) |
| `npm test` | 34 headless tests (scanner, analyzers, workflows, bridge, reconciliation, changes) |
| `npm run test:vscode` | launches the installed VS Code and runs checks inside the real extension host |
| `npm run test:ui` | serves the UI against the real RPC and screenshots every page with Chrome |

JavaScript / JSX only, no TypeScript.

## Architecture
```
src/extension.js          wiring only (config, commands, UI, bridge)
src/core/projectManager   orchestration; no vscode dependency, so it is testable headless
src/scanner/              file/folder/project scanner, language, hashes, tokens, packages, config, env
src/analyzer/             symbols, imports/exports, dependencies, reverse deps, routes/APIs, auth, services, state, events, features, architecture
src/database/             SQL/Prisma/migrations, ORM entities, relationships, queries, data flow
src/workflows/            call graph, tracer (UI → API → backend → DB), engine, store
src/context/              selector, dependency/workflow/database/feature context, reducer, validator, batch manager, builder
src/security/             secret detection and redaction
src/knowledge/            .ai-project store, hashing status, history, coverage, schema validation, evidence, reconciliation
src/bridge/               chromeBridge (facade), bridgeServer (WebSocket transport), protocol, security, sessions, runner
src/documentation/        deterministic docs from verified data (versions archived)
src/comparison/ generation/ changes/    comparison, blueprints, safe change pipeline
src/ui/                   React app (sidebar + editor tab) and its RPC/host
```
Provider-specific code (ChatGPT/Claude/Gemini selectors) does **not** exist here; VS Code only speaks the generic bridge protocol.

## Settings
All under `aiProject.*`: `provider`, `model`, `maxTokens`, `maxFiles`, `maxLinesPerFile`, `maxTotalLines`, `maxTokensPerFile`, `maxTotalTokens`, `maxDependencyDepth`, `maxWorkflowDepth`, `maxDocumentationDepth`, `excludePatterns`, `autoScan`, `autoUpdateDocumentation`, `detectSecrets`, `aiProjectFolder`, `saveHistory`, `requireApprovalForChanges`, `chromeBridgePort`, `chromeBridgeHost` (loopback only). Pairing secrets live in VS Code SecretStorage, never in settings or `.ai-project`.

## `.ai-project/`
```
project.json config.json
index/          files (hash + status), symbols, imports, exports, dependencies, dependents, routes, apis, database, environment (names only), conflicts, analysis-cache
workflows/      index.json + <id>.json   (static trace + verified AI knowledge)
database/       schema, entities, relationships, queries, data-flows
features/       index.json + <id>.json
architecture/   overview, application-flow, dependency-map, data-flow, technology-stack, architecture.json
documentation/  project-overview, architecture, workflows/, database/, features/, files/, status.json (per-doc hash status)
comparisons/ generation/ changes/ snapshots/ history/analysis-NNN.json
```
Portable: project-relative paths only, safe to commit to git. Static facts are regenerated on every scan; AI-derived `knowledge` blocks are preserved and only replaced by equal or stronger evidence.

## Chrome bridge
Loopback WebSocket, pairing token + user approval, session resume, heartbeat. Full description: `BRIDGE-PROTOCOL.md` in the project root, next to this extension's folder.

## Security
Secrets redacted before context leaves VS Code (and again in Chrome); Chrome messages are untrusted and validated; paths are normalized against traversal; AI claims are verified against source; code changes need a matching file hash and explicit approval; no logs contain tokens or keys.

