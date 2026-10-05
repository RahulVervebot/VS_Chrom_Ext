MASTER BUILD INSTRUCTION
BUILD VS CODE EXTENSION FIRST, THEN CHROME EXTENSION
You are the primary senior software engineer responsible for building a complete two-part developer tool:
VS Code Extension — AI Project Intelligence
Chrome Extension — AI Documentation & Comparison
Two separate detailed architecture specifications exist in this same folder.
Your first responsibility is to read and implement the VS Code extension specification completely.
Only after the VS Code extension is built, tested, and its Chrome Bridge contract is established should you build the Chrome extension.
Do not start by building both extensions simultaneously.

1. IMPORTANT — READ THE SPECIFICATION FILES FIRST
The current folder contains two master specification files.
They may have names similar to:
VS-CODE-EXTENSION-PROMPT.md
CHROME-EXTENSION-PROMPT.md

The exact filenames may be different.
First inspect the folder and identify the two specification files.
Determine which file describes:
VS Code Extension

and which file describes:
Chrome Extension

Read both specifications before making architectural decisions.
However:
BUILD ORDER IS STRICT
PHASE 1
VS Code Extension

        ↓

PHASE 2
VS Code ↔ Chrome Bridge Contract

        ↓

PHASE 3
Chrome Extension

        ↓

PHASE 4
End-to-End Integration Testing

Do not reverse this order.

2. TECHNOLOGY RULE
Both extensions must use:
JavaScript
React.js
JSX
HTML
CSS
JSON
Node.js where appropriate

DO NOT USE:
TypeScript
.ts
.tsx

Do not convert the project to TypeScript.
Do not introduce TypeScript even if a library or example uses TypeScript.
Use JavaScript equivalents.

3. FIRST TASK — INSPECT THE WORKSPACE
Before writing code:
Inspect the current directory.
Identify the two specification files.
Read the VS Code specification completely.
Read the Chrome specification completely.
Inspect any existing source code.
Determine whether extensions already exist.
Preserve useful existing implementation if present.
Do not delete existing work without understanding it.
Create a clear implementation plan internally.
Then begin with the VS Code extension.

4. DO NOT BUILD A DEMO
This is not a UI-only prototype.
Do not create fake implementations such as:
"Analysis complete"

without actually analyzing anything.
Do not create fake AI responses.
Do not hard-code fake workflows.
Do not hard-code fake database relationships.
Do not pretend that a file was analyzed when it was not.
If a feature cannot yet be implemented because it belongs to a later phase, create a clean module/interface and clearly mark the future implementation.
But implement the functionality that belongs to the current phase for real.

5. PRIMARY ARCHITECTURE
The final architecture must follow:
                        VS CODE EXTENSION
                                │
                                │
                         Actual Project
                                │
                                ▼
                         Project Scanner
                                │
                                ▼
                         Static Analysis
                                │
             ┌──────────────────┼──────────────────┐
             │                  │                  │
       Dependencies        Workflows          Database
             │                  │                  │
             └──────────────────┼──────────────────┘
                                ▼
                         Context Builder
                                │
                                ▼
                         Chrome Bridge
                                │
                                ▼
                       CHROME EXTENSION
                                │
                                ▼
                     ChatGPT / Claude / Gemini
                                │
                                ▼
                         AI Analysis
                                │
                                ▼
                       Chrome Validation
                                │
                                ▼
                       Knowledge Package
                                │
                                ▼
                         Chrome Bridge
                                │
                                ▼
                         VS CODE EXTENSION
                                │
                                ▼
                    Knowledge Reconciliation
                                │
                                ▼
                           .ai-project/

The VS Code extension is the source-of-truth layer.
The Chrome extension is the AI interaction layer.

6. VS CODE EXTENSION MUST BE BUILT FIRST
Start with the VS Code extension.
The VS Code extension must be able to:
Open a workspace
Detect the project
Initialize .ai-project
Scan files
Detect languages
Calculate hashes
Analyze symbols
Analyze imports/exports
Build dependencies
Build reverse dependencies
Detect APIs/routes
Detect database references
Detect features
Detect workflows
Detect configuration
Detect external services
Detect authentication/authorization
Build project context
Detect secrets
Maintain project knowledge
Maintain analysis history
Maintain incremental coverage
Communicate with Chrome
Receive structured knowledge from Chrome
Validate returned knowledge
Reconcile knowledge
Maintain documentation
Safely plan/apply source changes
Run verification after changes
Implement according to the VS Code specification file.

7. VS CODE PROJECT STRUCTURE
Use the structure defined by the VS Code specification.
At minimum it should contain the architectural modules:
src/
├── extension.js
├── commands/
├── scanner/
├── analyzer/
├── bridge/
├── context/
├── knowledge/
├── workflows/
├── database/
├── documentation/
├── comparison/
├── generation/
├── changes/
├── security/
├── config/
├── ui/
└── utils/

Do not collapse everything into extension.js.

8. VS CODE EXTENSION MANIFEST
Create a valid VS Code extension package.json.
Register:
activation events
commands
views
configuration
activity bar
sidebar
context menu actions where appropriate
Commands must follow the specification.
Examples:
AI Project: Initialize Project
AI Project: Scan Project
AI Project: Select Files
AI Project: Select Folder
AI Project: Analyze Selection
AI Project: Analyze Workflows
AI Project: Analyze Database
AI Project: Generate Documentation
AI Project: Compare Projects
AI Project: Generate Project Blueprint
AI Project: Analyze Change
AI Project: Apply AI Changes
AI Project: Verify Project

AI Project: Pair Chrome
AI Project: Connect Chrome
AI Project: Disconnect Chrome
AI Project: Show Chrome Status
AI Project: Resume Analysis


9. VS CODE UI
Build the React-based UI described in the VS Code specification.
Include:
Dashboard
Project
Scan
Files
Workflows
Database
Features
Architecture
Dependencies
Documentation

AI / Chrome
Connection
Active Analysis
Queue
History

Compare
Generate
Changes
Settings

The UI must show real state from the extension.
Do not populate it with fake static values.

10. IMPLEMENT SOURCE SCANNING
The scanner must work against the actual open workspace.
Implement:
fileScanner
folderScanner
projectScanner
languageDetector
hashCalculator
packageScanner
configScanner
environmentScanner
tokenEstimator

Support exclusions.
Do not scan:
node_modules
.git
dist
build
.next
coverage

unless explicitly requested/configured.

11. IMPLEMENT INCREMENTAL ANALYSIS
This is mandatory.
If the user analyzes:
src/auth/

and later:
src/orders/

both must belong to the same:
projectId

but different:
analysisId

Example:
analysis-001 → authentication
analysis-002 → orders

Merge them into:
.ai-project/

Do not create separate disconnected documentation systems.

12. IMPLEMENT SOURCE HASHING
Every analyzed file must have a source hash.
If the source has not changed:
do not unnecessarily re-analyze

If the source changed:
mark documentation OUTDATED

Then determine impacted:
dependencies
workflows
features
database knowledge
documentation


13. IMPLEMENT EVIDENCE
Every important knowledge item must contain:
VERIFIED
INFERRED
UNKNOWN

Never convert an AI assumption into verified source knowledge without evidence.
Example:
{
  "claim": "Order is inserted into orders table",
  "status": "VERIFIED",
  "evidence": [
    {
      "file": "src/services/orderService.js",
      "symbol": "createOrder"
    }
  ]
}


14. IMPLEMENT .AI-PROJECT
Create and maintain:
.ai-project/
├── project.json
├── config.json
├── index/
├── workflows/
├── database/
├── features/
├── architecture/
├── documentation/
├── comparisons/
├── generation/
├── changes/
├── snapshots/
└── history/

This folder must be portable.
Do not store machine-specific absolute paths as authoritative data.

15. IMPLEMENT CHROME BRIDGE IN VS CODE
After the core VS Code source analysis works, implement the bridge.
The bridge must be a clean abstraction.
Create:
src/bridge/
├── chromeBridge.js
├── bridgeServer.js
├── bridgeProtocol.js
├── connectionManager.js
├── messageManager.js
├── requestManager.js
├── responseManager.js
├── sessionManager.js
└── securityManager.js

Preferred communication:
Secure localhost WebSocket

The transport must be abstracted so it can be replaced later.

16. BRIDGE SECURITY
Do not expose an unauthenticated local service.
Implement pairing:
VS Code
↓
Temporary pairing token
↓
Chrome
↓
User confirmation
↓
Validation
↓
Connection

Support:
projectId
sessionId
connectionId
pairingToken

Pairing tokens must expire.
Validate all incoming messages.

17. BRIDGE MESSAGE PROTOCOL
Use a stable protocol.
Every message:
{
  "protocol": "ai-project",
  "protocolVersion": "1.0",
  "messageId": "msg-001",
  "messageType": "ANALYSIS_REQUEST",
  "sessionId": "session-001",
  "projectId": "project-001",
  "timestamp": "2026-09-29T12:00:00Z",
  "payload": {}
}

Support:
PAIR_REQUEST
PAIR_RESPONSE

PROJECT_REGISTER
PROJECT_REGISTER_RESPONSE

ANALYSIS_REQUEST
ANALYSIS_ACCEPTED

ANALYSIS_BATCH
ANALYSIS_BATCH_ACK

ANALYSIS_PROGRESS
ANALYSIS_COMPLETE

AI_RESPONSE
AI_RESPONSE_ACK

KNOWLEDGE_PACKAGE
KNOWLEDGE_PACKAGE_ACK

KNOWLEDGE_MERGE_REQUEST
KNOWLEDGE_MERGE_RESULT

DOCUMENTATION_REQUEST
DOCUMENTATION_RESPONSE

COMPARISON_REQUEST
COMPARISON_RESPONSE

BLUEPRINT_REQUEST
BLUEPRINT_RESPONSE

CHANGE_PROPOSAL

CANCEL_REQUEST
PAUSE_REQUEST
RESUME_REQUEST
RETRY_REQUEST

ERROR
WARNING

PING
PONG

SESSION_RESUME
SESSION_RESUME_RESPONSE


18. ANALYSIS PACKAGE
VS Code must send Chrome structured data.
Example:
{
  "packageType": "PROJECT_ANALYSIS",
  "schemaVersion": "1.0",

  "project": {
    "projectId": "project-001",
    "name": "My Application"
  },

  "analysis": {
    "analysisId": "analysis-001",
    "mode": "WORKFLOW",
    "purpose": "Analyze checkout workflow"
  },

  "selection": {
    "files": [],
    "folders": [],
    "features": [],
    "workflows": []
  },

  "files": [],
  "symbols": [],
  "dependencies": [],
  "apis": [],
  "database": {},

  "existingKnowledge": {},

  "instructions": {
    "sourceOfTruth": "SOURCE_CODE",
    "doNotInvent": true,
    "useEvidenceLabels": true
  }
}


19. SECRET REDACTION
Before anything is sent to Chrome:
Source
↓
Secret Detection
↓
Redaction
↓
Context
↓
Chrome

Detect:
API keys
passwords
tokens
JWT secrets
AWS credentials
OAuth credentials
private keys
database credentials
.env secrets
service credentials
webhook secrets

Replace with:
[REDACTED_SECRET]

Never send secrets to Chrome.

20. TOKEN-AWARE BATCHING
Large projects must not be sent as one huge request.
Create:
Batch Manager

Batch metadata:
{
  "analysisId": "analysis-001",
  "batchId": "batch-001",
  "batchNumber": 1,
  "totalBatches": 5,
  "purpose": "workflow analysis",
  "previousContextReference": null
}

Maintain checkpointing.

21. CHROME BUILD MUST START ONLY AFTER VS CODE BRIDGE IS READY
Once the VS Code extension has:
scanner
analysis
knowledge store
context builder
bridge
protocol

working, move to the Chrome extension.
Do not start Chrome implementation before this point unless required to test the bridge.

22. THEN BUILD CHROME EXTENSION
Now read the Chrome specification again and implement it exactly.
The Chrome extension must use:
Manifest V3
JavaScript
React.js
JSX
HTML
CSS
JSON

No TypeScript.

23. CHROME RESPONSIBILITY
Chrome is responsible for:
AI web interaction
AI provider detection
ChatGPT interaction
Claude interaction
Gemini interaction
Generic AI adapter
Prompt construction
AI batching
AI response extraction
Response validation
Documentation generation
Comparison
Blueprint generation
Knowledge normalization
Sending knowledge back to VS Code

Chrome is NOT responsible for:
direct source modification
filesystem authority
final source verification
running project tests
running project builds
authoritative project storage


24. CHROME STRUCTURE
Implement the structure from the Chrome specification.
At minimum:
chrome-extension/
├── manifest.json
├── package.json
├── src/
│   ├── background/
│   ├── content/
│   ├── bridge/
│   ├── ai/
│   ├── batching/
│   ├── documentation/
│   ├── comparison/
│   ├── knowledge/
│   ├── ui/
│   └── utils/
└── public/


25. AI PROVIDER ADAPTERS
Implement:
AIAdapter
ChatGPTAdapter
ClaudeAdapter
GeminiAdapter
GenericAIAdapter

Interface:
class AIAdapter {
    detect() {}
    getCapabilities() {}
    getInputBox() {}
    enterPrompt() {}
    submitPrompt() {}
    detectResponse() {}
    readResponse() {}
    detectError() {}
    detectLimit() {}
}

Website-specific selectors must stay inside provider-specific adapters.
Never put ChatGPT selectors inside generic logic.

26. AI WEBSITE SAFETY
If selectors no longer work:
STOP

Do not:
click random elements
send wrong information
submit to the wrong field
assume a response exists
Show the user that the provider interface has changed.

27. CHROME ANALYSIS FLOW
Implement:
VS Code
↓
Analysis Request
↓
Chrome receives package
↓
Determine AI provider
↓
Build prompt
↓
Create batches
↓
Send batch
↓
Read response
↓
Validate response
↓
Store checkpoint
↓
Process next batch
↓
Build Knowledge Package
↓
Send to VS Code


28. CHROME CHECKPOINTING
After every successful AI response:
save checkpoint

Store:
analysisId
batchId
status
response
knowledge
timestamp

If browser closes:
resume

Do not duplicate completed batches.

29. CHROME RESPONSE VALIDATION
AI responses must be parsed and validated.
If malformed:
Retry with structured JSON correction request

If still invalid:
mark batch failed

Do not send malformed knowledge to VS Code.

30. KNOWLEDGE PACKAGE
Chrome must return structured knowledge.
Example:
{
  "packageType": "KNOWLEDGE_PACKAGE",
  "schemaVersion": "1.0",
  "projectId": "project-001",
  "analysisId": "analysis-001",

  "source": {
    "provider": "ChatGPT",
    "model": "MODEL_NAME"
  },

  "knowledge": {
    "files": [],
    "features": [],
    "workflows": [],
    "database": {},
    "architecture": {},
    "dependencies": []
  },

  "evidence": [],
  "unknowns": []
}


31. VS CODE RECEIVES KNOWLEDGE
When VS Code receives a knowledge package:
Receive
↓
Authenticate
↓
Validate schema
↓
Validate projectId
↓
Validate analysisId
↓
Verify source hashes
↓
Verify evidence
↓
Reconcile
↓
Save
↓
Update documentation
↓
Update coverage


32. SOURCE VERIFICATION
If Chrome/AI says:
orders table has payment_status

VS Code must check actual project evidence.
If evidence exists:
VERIFIED

If it does not:
UNKNOWN

Do not trust AI merely because it produced structured JSON.

33. COMPARISON
Chrome may perform:
Project comparison
Feature comparison
Workflow comparison
Database comparison
Architecture comparison

VS Code provides the source knowledge.
Chrome returns structured comparison knowledge.
VS Code stores it under:
.ai-project/comparisons/

Do not modify source code as a result of comparison.

34. BLUEPRINT
Chrome may generate:
PROJECT_BLUEPRINT

from:
Project A
Project B
Project C
User requirements

VS Code stores:
.ai-project/generation/project-blueprint.json

Blueprints are planning artifacts.
They do not automatically modify source code.

35. CHANGE PROPOSALS
If AI proposes code changes:
Chrome
↓
CHANGE_PROPOSAL
↓
VS Code
↓
Validate
↓
Impact Analysis
↓
Hash Check
↓
Diff
↓
User Approval
↓
Apply

Chrome must never directly modify local project files.

36. CHANGE SAFETY
Before applying any AI-generated change:
Compare:
expectedHash

against:
currentHash

If different:
STOP

Show:
File changed since analysis.
Re-analysis required.


37. TESTING AFTER CHANGES
After user approval:
Apply
↓
Tests
↓
Lint
↓
Typecheck if applicable
↓
Build
↓
Rescan
↓
Update hashes
↓
Update knowledge
↓
Update documentation

Commands must be detected from the project.
Do not blindly assume:
npm test
npm run build


38. END-TO-END TEST
Once both extensions are built, perform an actual end-to-end test.
Test:
VS Code
↓
Create test project
↓
Initialize .ai-project
↓
Scan project
↓
Select files
↓
Pair Chrome
↓
Connect
↓
Send ANALYSIS_REQUEST
↓
Chrome receives it
↓
Chrome processes test analysis
↓
Return KNOWLEDGE_PACKAGE
↓
VS Code validates it
↓
VS Code stores knowledge

Then test:
Disconnect Chrome
↓
Reconnect
↓
Resume

Then test:
Analyze folder A
↓
Analyze folder B
↓
Verify both merge into same project

Then test:
Modify source file
↓
Rescan
↓
Verify OUTDATED status


39. TEST FAILURE HANDLING
If the end-to-end test fails:
Do not hide the failure.
Determine whether the issue is:
VS Code
Bridge
Authentication
Protocol
Chrome
AI adapter
Response parsing
Knowledge validation
Reconciliation

Fix the issue before proceeding.

40. DO NOT SIMPLIFY THE ARCHITECTURE
Do not replace the architecture with:
VS Code → REST API → AI

unless explicitly requested.
The purpose of the Chrome extension is specifically to provide AI web interaction.
The intended flow is:
VS Code
↕
Chrome
↕
AI Website


41. DO NOT COUPLE VS CODE TO A SPECIFIC AI
The VS Code extension must not contain:
ChatGPT DOM selectors
Claude DOM selectors
Gemini DOM selectors

Those belong only to Chrome.
VS Code communicates with the generic Chrome Bridge protocol.

42. DO NOT COUPLE CHROME TO PROJECT FILESYSTEM
Chrome must not directly browse arbitrary local project directories.
VS Code determines what source context is shared.
Chrome receives only authorized analysis packages.

43. DATA OWNERSHIP
The ownership model is:
SOURCE CODE
    ↓
VS CODE
    ↓
STATIC ANALYSIS
    ↓
CONTEXT
    ↓
CHROME
    ↓
AI
    ↓
CHROME
    ↓
KNOWLEDGE PACKAGE
    ↓
VS CODE
    ↓
VALIDATION
    ↓
.ai-project


44. FINAL DIRECTORY
The completed workspace should look conceptually like:
project-root/
│
├── VS-CODE-EXTENSION-SPEC.md
├── CHROME-EXTENSION-SPEC.md
├── BUILD-INSTRUCTIONS.md
│
├── vscode-extension/
│   ├── package.json
│   ├── src/
│   ├── media/
│   └── README.md
│
└── chrome-extension/
    ├── package.json
    ├── manifest.json
    ├── src/
    ├── public/
    └── README.md

If the specifications already exist in different locations, do not move them unnecessarily.

45. DOCUMENTATION
Create a README for each extension.
VS Code README must explain:
Installation
Development
Running Extension
Architecture
Commands
Settings
.ai-project
Chrome Bridge
Security
Troubleshooting

Chrome README must explain:
Installation
Development
Loading unpacked extension
Supported AI providers
VS Code pairing
Bridge protocol
Security
Troubleshooting

Also create a shared protocol document:
BRIDGE-PROTOCOL.md

Document:
Connection
Pairing
Messages
Schemas
Errors
Session recovery
Knowledge packages
Versioning


46. VERSIONING
Version the bridge protocol separately.
Example:
protocolVersion: 1.0

If the protocol changes incompatibly:
VS Code bridge version
Chrome bridge version

must be checked during connection.
If incompatible:
Connection rejected
Compatible versions required


47. FUTURE COMPATIBILITY
Design for future:
Cloud sync
Team projects
Remote analysis
GitHub integration
GitLab integration
CI/CD
Issue tracking
AI agents

Do not implement unnecessary future features now.
Create clean interfaces so they can be added later.

48. DEVELOPMENT ORDER
Follow exactly this order:
STEP 1
Inspect specifications and workspace.
STEP 2
Create/build VS Code extension.
STEP 3
Implement project scanner.
STEP 4
Implement source analysis.
STEP 5
Implement .ai-project.
STEP 6
Implement incremental knowledge.
STEP 7
Implement React UI.
STEP 8
Implement Chrome Bridge.
STEP 9
Test VS Code bridge independently.
STEP 10
Build Chrome extension.
STEP 11
Implement AI provider adapters.
STEP 12
Implement Chrome batching.
STEP 13
Implement AI response parsing.
STEP 14
Implement Chrome → VS Code knowledge package.
STEP 15
Perform end-to-end integration.
STEP 16
Fix integration issues.
STEP 17
Document everything.

49. DO NOT ASK FOR UNNECESSARY CONFIRMATION
You are expected to implement the system from the specifications.
Do not repeatedly ask:
Should I create this file?
Should I use React?
Should I use JavaScript?
Should I create the bridge?

Those decisions are already defined.
If an implementation detail is genuinely ambiguous, choose the option that best preserves the architecture and document the decision.
Only ask the user when a decision would materially change the product architecture or requires information unavailable from the workspace.

50. IMPORTANT: PRESERVE WORKING CODE
If implementation already exists:
inspect
understand
reuse
refactor where needed

Do not delete working modules simply to recreate them.
Do not overwrite user source projects.
Do not modify arbitrary projects while developing the extensions.

51. FINAL VALIDATION CHECKLIST
Before declaring completion, verify:
VS Code
[ ] Extension activates
[ ] Activity Bar works
[ ] React UI works
[ ] Commands work
[ ] Workspace detection works
[ ] Project initialization works
[ ] Scanner works
[ ] Hashing works
[ ] Exclusions work
[ ] Dependency analysis works
[ ] API detection works
[ ] Database detection works
[ ] Workflow analysis works
[ ] Feature analysis works
[ ] .ai-project works
[ ] Incremental analysis works
[ ] History works
[ ] Coverage works
[ ] Secret detection works
[ ] Chrome bridge works
[ ] Knowledge validation works
[ ] Knowledge reconciliation works
[ ] Change safety works

Chrome
[ ] Manifest V3 works
[ ] React UI works
[ ] Bridge connection works
[ ] Pairing works
[ ] ChatGPT adapter works
[ ] Claude adapter works
[ ] Gemini adapter works
[ ] Generic adapter exists
[ ] Prompt builder works
[ ] Batch manager works
[ ] Response parser works
[ ] Checkpointing works
[ ] Resume works
[ ] Knowledge package works
[ ] Comparison works
[ ] Blueprint works

Integration
[ ] VS Code → Chrome works
[ ] Chrome → VS Code works
[ ] Analysis request works
[ ] Analysis batches work
[ ] Progress works
[ ] Pause works
[ ] Resume works
[ ] Cancel works
[ ] Knowledge package works
[ ] Source verification works
[ ] Incremental reconciliation works
[ ] Disconnect/reconnect works


52. CRITICAL FINAL RULE
Do not consider the task complete merely because the files exist.
The goal is a working system.
The final system must behave like:
                    ┌─────────────────────┐
                     │      VS CODE        │
                     │                     │
                     │  REAL PROJECT       │
                     │  SOURCE CODE        │
                     │  SCANNER            │
                     │  ANALYSIS           │
                     │  KNOWLEDGE          │
                     │  VALIDATION         │
                     │  CODE CHANGES       │
                     └──────────┬──────────┘
                                │
                         SECURE BRIDGE
                                │
                                ▼
                     ┌─────────────────────┐
                     │       CHROME        │
                     │                     │
                     │  AI WEB INTERACTION │
                     │  BATCHING           │
                     │  DOCUMENTATION      │
                     │  COMPARISON         │
                     │  BLUEPRINT          │
                     └──────────┬──────────┘
                                │
                  ┌─────────────┼─────────────┐
                  ▼             ▼             ▼
               ChatGPT       Claude        Gemini
                  │             │             │
                  └─────────────┼─────────────┘
                                │
                                ▼
                         AI KNOWLEDGE
                                │
                                ▼
                     ┌─────────────────────┐
                     │      VS CODE        │
                     │                     │
                     │  VERIFY             │
                     │  RECONCILE          │
                     │  SAVE               │
                     │  .ai-project/       │
                     └─────────────────────┘

The most important rule is:
BUILD THE VS CODE EXTENSION FIRST. COMPLETE AND TEST ITS CORE ARCHITECTURE AND CHROME BRIDGE. THEN BUILD THE CHROME EXTENSION AGAINST THAT BRIDGE. FINALLY TEST BOTH TOGETHER END-TO-END.
Do not replace the architecture with a simplified implementation just to make the first version easier.
