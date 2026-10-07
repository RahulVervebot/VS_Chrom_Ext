# AI Project Intelligence: how to use it

Two extensions that work together:

| | What it does |
|---|---|
| **VS Code extension** (`vscode-extension/`) | Reads your real project, analyzes it, and keeps a portable knowledge base in a `.ai-project/` folder. It is the **source of truth**. |
| **Chrome extension** (`chrome-extension/`) | Takes the project context VS Code prepares, asks **ChatGPT / Claude / Gemini** (in your own browser tab, logged in as you) to analyze it, checks the answers, and sends structured knowledge back. |

```
Your code → VS Code (scan, analyze, redact secrets) → Chrome → ChatGPT/Claude/Gemini
                       ▲                                           │
                       └── VS Code checks every claim against ◄────┘
                           the real source, then saves .ai-project/
```

The AI is never trusted. VS Code opens the files the AI cites and only marks a claim **VERIFIED** when the source really supports it.

---

## 1. One-time setup

You need **Node.js 18+**, **VS Code 1.85+**, and **Google Chrome 116+**.

```bash
# VS Code extension
cd vscode-extension
npm install
npm run build

# Chrome extension
cd ../chrome-extension
npm install
npm run build
```

> If `npm install` fails with a permission error on `~/.npm`, run it with `--cache /tmp/npm-cache`.

### Install the VS Code extension (easiest)
This installs it into your normal VS Code, so there is no special test window to find.
```bash
cd vscode-extension
npx @vscode/vsce package --allow-missing-repository      # creates ai-project-intelligence-0.2.1.vsix
```
Then in VS Code: **Extensions** panel (Cmd/Ctrl+Shift+X) → the **`···`** menu at its top → **Install from VSIX…** → pick that file. Reload VS Code if asked.

<details><summary>Or run it from source (for developers)</summary>

Open the `vscode-extension` folder in VS Code → **Run and Debug** (Cmd/Ctrl+Shift+D) → choose **Run Extension (sample project)** → green play button (Mac: fn+F5). A second window titled **[Extension Development Host]** opens on a disposable copy of a sample shop project (`.sample/shop`, reset with `npm run sample:reset`). Use that window. To try your own folder choose **Run Extension (choose a folder)**, then File → Open Folder… inside that window.
</details>

### Load the Chrome extension
1. Go to `chrome://extensions`, switch on **Developer mode** (top right).
2. Click **Load unpacked** and select the **`chrome-extension`** folder.
3. Pin **AI Project Bridge** to the toolbar. Clicking its icon opens the side panel.
4. Open **ChatGPT**, **Claude** or **Gemini** in a normal tab and **log in**. The extension works inside that tab; it never asks for your password or an API key.

---

## 2. First run, step by step

Open your project **folder** in VS Code (File → Open Folder…). Then you only need one thing:

> Click **`🚀 AI Project`** in the status bar (bottom-left), or press Cmd/Ctrl+Shift+P and run **AI Project: Start Here**.

A checklist appears. The arrow marks the next step; pick it, it runs, and the list comes back:

1. **Set up this project**: creates a `.ai-project` folder next to your code. Safe to run again.
2. **Scan the code**: reads your real files and finds workflows, APIs, database usage and dependencies. No AI is used yet, so coverage correctly says **NOT ANALYZED**.
3. **Choose what to analyze**: pick **The entire project**, **A folder…** or **Specific files…**. (Large projects are split into batches automatically. One run sends at most **200 files** (`aiProject.maxFilesPerAnalysis`), in batches of at most 40 (`aiProject.maxFiles`). **Run the analysis again to continue:** files that are already analyzed and unchanged are skipped, so the next run takes the next files, then changed files. The preview shows how many were skipped and how many are still waiting. Tick **Re-analyze files that are already analyzed** to start over.)
4. **Connect Chrome (once per project)**: shows a pairing code such as `47821-7K3M9QX2LPWA`. In Chrome click the **AI Project Bridge** icon → **Connection** tab → paste the whole code → **Pair**, then click **Allow** in the VS Code dialog. Next time Chrome reconnects on its own.
5. **Analyze with AI**: VS Code shows a **privacy summary** (files, batches, estimated tokens, secrets redacted). Click **Send**.

The same checklist is a **Getting started** card at the top of the sidebar (click the node-graph icon in the Activity Bar), with buttons for *Entire project*, *Choose folder…*, *Choose files…* and the pairing code shown right there.

Other ways to pick files: right-click a file or folder in the Explorer → **AI Project: Select Files / Select Folder**, or use the **Files** page of the sidebar and tick boxes.

**Then, in Chrome: approve.** The Chrome panel's **Analysis** tab shows *Review before sending*, with the same summary, the AI provider it will use, and the list of files. Nothing goes to the AI until you click **Send and analyze**.

**Wait.** Chrome types each batch into your ChatGPT/Claude/Gemini tab, waits for the answer, validates it, and saves a checkpoint after every batch. You can watch progress in either window. You can **Pause**, **Stop**, **Retry** or **Skip** a batch.

**Read the result.** VS Code verifies the returned knowledge and updates `.ai-project/`. Then run **AI Project: Generate Documentation**. Look at:
- Sidebar → **Workflows**: the traced path from UI click → API → backend → database, with evidence on every step.
- Sidebar → **Database**, **Features**, **Architecture**, **Documentation**.
- `.ai-project/architecture/overview.md` and `.ai-project/documentation/…`.

Analyze another folder later (for example `src/orders/`). It **merges into the same project** as a new analysis (`analysis-002`); nothing is duplicated or overwritten.

---

### Switching to another project
Chrome works with one project at a time. To stop here and work on another: (1) optionally **Pause/Stop** in the Chrome panel's Analysis tab (otherwise the unfinished analysis is **paused automatically with all progress kept**); (2) open the other project in VS Code and click **`AI Project`** → *Connect Chrome*; (3) in Chrome's **Connection** tab paste the new code under **Working on another project?** and press **Switch to that project**; (4) press **Allow** in VS Code. Later, to finish the first project: open it, connect Chrome to it the same way, and run **AI Project: Resume Analysis**. Results Chrome finished for a project in the meantime are held and delivered only to that project. Several VS Code windows can be open at once; each gets its own port automatically (it is inside the code).

---

## 3. What the labels mean

| Label | Meaning |
|---|---|
| **VERIFIED** | VS Code found the cited evidence in the real source (file, symbol, line range, hash all check out). |
| **INFERRED** | A reasonable interpretation the source does not state directly. |
| **UNKNOWN** | Could not be established. Never guessed. |

| File status | Meaning |
|---|---|
| **NOT_ANALYZED** | No verified AI analysis yet (static facts still exist). |
| **ANALYZED** | Analyzed, and the file has not changed since. |
| **PARTIAL** | Analyzed but with unresolved unknowns. |
| **OUTDATED** | The file changed after it was analyzed; its documentation is marked OUTDATED too. Re-analyze it. |

The project is **never** reported as fully understood unless every source file is analyzed.

---

## 4. Everyday tasks

| I want to… | Do this |
|---|---|
| Understand one workflow (e.g. *place order*) | **Analyze Workflows** → pick it. Or sidebar → Workflows → **Analyze with AI…** |
| Understand a feature | **Analyze Feature** |
| Understand the database | **Analyze Database** |
| See what depends on a file | Sidebar → **Dependencies**, or right-click a file → **Show Dependency Graph** |
| Keep docs current after editing code | **Scan Project** (marks changed files OUTDATED), re-analyze, then **Update Documentation** |
| Continue after Chrome/VS Code closed | **Resume Analysis**. Completed batches are not repeated. |
| Compare projects | Analyze each project first, then **Compare Projects** and choose the other project folder(s) that contain a `.ai-project`. Approve the request in Chrome (**Compare** tab). Results are saved in `.ai-project/comparisons/`. No scores or rankings are produced. |
| One file describing the whole project (to give to an AI) | **Compare** page → step 1 **Create specification file** (also refreshed every time you run **Update Documentation**). It writes `.ai-project/exports/project-spec.txt` (and a `.json` twin): features, database tables and fields (with required/unique/validation), validation rules, required modules with versions, API endpoints, workflows, authentication, external services, environment variable names, tests and what is unknown. No source code and no secret values. **Copy for ChatGPT / Claude** puts it on the clipboard so an AI can rebuild the project from it. |
| Compare two projects (what is common, what only one has) | **Compare** page → step 2 **Compare (instant)**, choose the other project's folder (the project folder or its `.ai-project`). You see, per area (features, tables, fields, APIs, validation, modules, auth, services, env vars, layers…), what is in both, only in one, and what differs, plus **Blueprint suggestions** (consider / keep / decide). **Compare + ask AI** also sends both specification files and the differences to ChatGPT/Claude through Chrome and shows its explanation next to the instant result. |
| Plan a new project from the comparison | **Generate** page → **Generate blueprint**. The full specifications of the chosen projects and the gaps from the latest comparison are sent with your requirements. The blueprint is shown by section (features, database, APIs, folder tree, decisions needed). |
| See only part of the project | Select files or a folder (**Files** tab) or a feature. **Architecture, Database, Features, Workflows and Dependencies** then show only that part (a blue bar says so); click **Show entire project** to switch back. Dependencies also lists what the part needs from, and what is used by, the rest of the project. |
| Compare one feature (or some files) with another project's | Select the files in the sidebar (**Files**), or pick a feature/workflow, then **AI Project: Compare Selected Files / Feature** (the **Selected files / feature** button on the Compare page). Choose the other project's folder and say which feature, workflow or files there correspond. Only those parts are compared, together with their generated documentation if it exists; the rest of both projects is not sent. The report lists exactly which files were compared. |
| Compare the documentation of two projects | In each project run **Update Documentation** first. Then **AI Project: Compare Documentation** (or the **Documentation** button on the Compare page) and pick the other project's folder. Both projects' generated documents (overview, architecture, features, workflows, database) are sent to Chrome with secrets removed (up to about 6,000 characters per document and 60,000 per project; anything cut or left out is listed in the result). The report is saved in `.ai-project/comparisons/` as JSON and markdown. |
| Plan a new project from existing ones | **Generate Project Blueprint** (approve in Chrome). Saved to `.ai-project/generation/project-blueprint.json`. It is a plan only. **Create Project From Blueprint** makes empty folders in a folder you choose. |
| Exclude files from analysis | **Configure Exclusions** (presets for Node, React, Next.js, Python, PHP, Laravel, WordPress, Java, .NET). Excluded files are never scanned or sent. |

### Safe code changes
1. **Generate Change Plan** (or **Analyze Change** for impact only). Describe the change.
2. If the AI proposes an edit, VS Code shows a notification: **Review AI Changes** opens the diff, the impact (dependents, workflows, features, database entities) and a risk level.
3. **Apply AI Changes** re-checks that every file still has the hash the AI analyzed. If a file changed you get *"File changed since analysis. Re-analysis required."* and nothing is written.
4. After you approve, originals are backed up under `.ai-project/snapshots/changes/`, the change is applied, and the project's own **test / lint / typecheck / build** commands (found in `package.json`, Composer or Makefile, never assumed) run. The project is rescanned and affected docs are marked OUTDATED. You can roll back if checks fail.

Chrome can never write to your files. Only VS Code applies changes, and only after you approve.

---

## 5. Settings

**VS Code** (Settings → search `aiProject`): `maxTokens` (per batch), `maxFiles`, `maxLinesPerFile`, `maxTotalTokens`, `maxDependencyDepth`, `excludePatterns`, `detectSecrets`, `autoScan`, `chromeBridgePort`, `requireApprovalForChanges`, and more.

**Chrome** (panel → Settings): the AI provider (Auto uses the AI tab you have open; or choose ChatGPT / Claude / Gemini / another site), your own limits per request, and how long to wait for an answer. Provider limits change and are never assumed, so set values that fit your account. Big analyses are split into batches automatically, and a batch is split again if the AI says it is too large or cuts its answer off.

Use **Settings → Check provider** in Chrome before a big run: it confirms the AI page still looks the way the extension expects.

---

## 6. Privacy and safety

- Everything between the two extensions stays on your machine (`127.0.0.1`). Only your own browser tab talks to the AI website.
- Secrets (API keys, passwords, tokens, private keys, database credentials, `.env` values) are replaced with `[REDACTED_SECRET]` in VS Code, and checked again in Chrome before typing anything. `.env` files are excluded by default.
- You approve every analysis twice: once in VS Code (privacy summary), once in Chrome (*Send and analyze*).
- Pairing needs the code **and** your approval in VS Code. Web pages cannot connect to the bridge.
- If the AI website changes its layout, the extension **stops** and tells you instead of guessing. It will not click random buttons or type into the wrong field.

---

## 7. Troubleshooting

| Problem | Fix |
|---|---|
| Chrome: *Could not reach VS Code* | In VS Code run **Pair Chrome** (or **Connect Chrome**). Check the port matches. |
| *Invalid pairing token* / *expired* | Codes last 2 minutes and work once. Run **Pair Chrome** again. |
| Analysis waits forever in VS Code | It waits for you to click **Send and analyze** in the Chrome panel. |
| `NO_TAB` | Open ChatGPT / Claude / Gemini in a tab (and select it if Provider is Auto). |
| Chrome is connected to the wrong project | Open the right project in VS Code → *Connect Chrome* → paste the new code in Chrome's Connection tab (*Switch to that project*). |
| `LOGIN` / `CAPTCHA` | Complete it in the AI tab, then **Retry batch** in the panel. |
| `LIMIT` | Your AI account hit a usage cap. Wait, or switch provider in Settings, then **Retry batch**. |
| `UI_CHANGED` | Either the AI website no longer matches the extension (see *Known limitations*), or — when the message says the send button stayed disabled — the message was too large for the chat box. The extension then splits it automatically (see *Large prompts* below); you only see this error if even small messages are refused. |
| `INVALID_JSON` | The AI would not return valid structured data even after one correction. **Retry batch**, or lower *Max tokens per request*. |
| Many claims come back UNKNOWN | Expected. It means the AI cited things the source does not show. Look at **Sync** in Chrome or `.ai-project/index/conflicts.json`. |
| Nothing detected (no workflows/APIs) | Check **Configure Exclusions** and that the project uses supported frameworks. Analysis is pattern-based. |
| Logs | VS Code: *View → Output → AI Project Intelligence*. Chrome: `chrome://extensions` → AI Project Bridge → *service worker*. |

---

## 7b. Projects in different languages and structures

Every project is analysed on its own and turned into the same specification format, so projects written in different languages and frameworks can be matched feature by feature, table by table and field by field. The analysis is pattern-based: it reads what the code literally declares and gives each result a file and line.

| Ecosystem | Routes / APIs | Database models | Validation rules | Packages |
|---|---|---|---|---|
| JavaScript, TypeScript, React, Vue | Express, Fastify, Hapi, NestJS, Next.js, Nuxt, SvelteKit | Mongoose, Sequelize, TypeORM, Prisma, knex | schema options, Joi, zod, yup, express-validator, class-validator, form attributes | `package.json` |
| Python | Flask / Quart (blueprints), FastAPI (routers), Django `urlpatterns` + `include()` + DRF routers, Odoo `http.route` (route lists), Sanic, Bottle, aiohttp, Pyramid | Django ORM, SQLAlchemy 1.x/2.0, SQLModel, Odoo models (`fields.*`, `_name`, `_inherit`), Tortoise, Peewee, Mongoengine | model field options, pydantic, marshmallow, DRF serializers, WTForms, Odoo constraints | `requirements.txt`, `pyproject.toml` |
| Go | gin, echo, fiber, chi, gorilla/mux, net/http (groups, middleware) | GORM, sqlx (incl. relations) | struct tags `gorm` / `binding` / `validate` | `go.mod` |
| Java, Kotlin | Spring MVC/WebFlux, JAX-RS, Micronaut, Ktor | JPA / Hibernate (Java and Kotlin classes), Spring Data repositories | Bean Validation, `@Column` | `pom.xml`, Gradle |
| C# | ASP.NET Core controllers, minimal APIs | EF Core entities, DbSet calls | DataAnnotations, FluentValidation | `.csproj` |
| Ruby | Rails `routes.rb` (resources, namespaces, member/collection), Sinatra | `db/schema.rb`, ActiveRecord models and associations | `validates`, schema constraints | `Gemfile` |
| PHP | Laravel (groups, resources), Symfony attributes, WordPress REST | Eloquent, Laravel migrations | Laravel `rules()` / `validate()` | `composer.json` |
| Rust | actix-web, axum, rocket | diesel `table!`, sea-orm, sqlx | `validator` crate | `Cargo.toml` |
| Any language | OpenAPI/Swagger (JSON or YAML), protobuf services, GraphQL schemas | SQL, Prisma | OpenAPI schema rules | |

**Project structure.** Sub-projects are detected from their marker files (monorepo packages, `apps/*` / `packages/*` / `services/*`, Odoo add-ons, Django apps, Maven/Gradle modules, Go modules, Rust crates, .NET projects, Composer/Ruby/Python packages). In a repository with several of them, each sub-project becomes a feature, and they are listed in the specification and compared.

**What makes cross-language matching work.** Endpoint paths are normalised (`:id`, `{id}`, `<int:id>`, `*rest` all become `:param`), column types are reduced to families (string, number, bool, datetime, uuid, json), table and field names ignore case, underscores and plural endings (`user_id` = `UserID`, `orders` = `Order`), and rules are compared by meaning (`required` = `not null` = `binding:"required"` = `presence: true`). Packages are only matched inside the same ecosystem (npm, pip, go…). The comparison also lists the languages, frameworks and sub-projects of each project.

**Not covered yet:** Swift, Dart, Scala, Elixir and other languages get a file list, basic symbols and their package manifest, but no routes, models or rules. The AI analysis can fill those gaps.

---

### Large prompts (split into parts)

A prompt larger than **Max characters per chat message** (Settings → Limits, default 30,000) is sent as several messages, file by file. If the chat box refuses a message (the send button never enables), the extension retries by itself with parts half the size, down to about 2,500 characters. Every part is numbered and tells the AI what to do:

- *"This is part 2 of 5 of one request. Do NOT answer yet; reply only `RECEIVED 2/5`. The next files will be sent in the next message: …"*
- Only the **final** part asks for the answer, and the AI is told to treat all parts as one prompt.
- A file that is too big for one part is cut at line boundaries with "continues in the next message" markers.
- If a retry starts over, the first message says to ignore the earlier parts.

The same applies to documentation, comparison and blueprint requests.

---

## 8. Known limitations (please read)

- **The AI website selectors are unverified against the live sites.** ChatGPT, Claude and Gemini change their pages often. The adapters (`chrome-extension/src/ai/*Adapter.js`) were written from knowledge of those pages and tested against local stand-ins that mimic their structure, in a real Chrome. They have **not** been run against the real chatgpt.com, claude.ai or gemini.google.com. The first time you use each provider, run **Check provider**. If a selector is wrong you will get `UI_CHANGED` (and nothing is sent); fix the selector list at the top of that adapter file, bump its `adapterVersion`, and `npm run build`.
- Analysis is **pattern-based**, not a full compiler-grade parser. It is honest about what it finds, but unusual code styles can be missed. Supported well: JavaScript/JSX (Express, React), plus reasonable coverage for Python, PHP, Java, Go, C#, Ruby, SQL and Prisma.
- Long prompts are typed into the chat box (not uploaded as files). Very large context is split into batches; some AI accounts still reject very long messages.
- Tested on macOS. Windows and Linux are expected to work (paths, line endings and shell handling were written for them) but are untested.
- Chrome must stay open with the AI tab logged in while an analysis runs. Closing it pauses the analysis and it resumes from the last checkpoint.

---

## 9. For developers

```
BRIDGE-PROTOCOL.md      shared wire protocol (read this to change either side)
vscode-extension/       README.md, src/, test/
chrome-extension/       README.md, src/, test/
```

Tests (all real, no mocks of the components under test):
```bash
cd vscode-extension && npm test          # 34 headless tests
cd vscode-extension && npm run test:vscode   # launches real VS Code, 12 checks
cd vscode-extension && npm run test:ui       # renders all UI pages in real Chrome
cd chrome-extension && npm test          # 35 tests (parser, adapters on fixture DOMs, orchestrator ↔ real VS Code bridge)
cd chrome-extension && npm run test:e2e  # real Chrome + the unpacked extension + real VS Code bridge + a local chatgpt.com stand-in
```
Set `AIPI_CHROME_PATH` / `AIPI_VSCODE_PATH` if your apps are not in the default location.
