BUILD A CHROME EXTENSION — AI PROJECT DOCUMENTATION & COMPARISON SYSTEM
1. PRODUCT PURPOSE
Build a production-quality Google Chrome extension using JavaScript and React.js.
Do NOT use TypeScript.
The Chrome extension is a companion to the existing AI Project Intelligence VS Code extension.
The Chrome extension is primarily an AI web interaction, documentation, and project comparison tool.
It is NOT the primary source-code editor.
It must NOT automatically modify the user's project source code.
Its main purpose is to:
Receive project/feature/file context from the VS Code extension.
Allow the user to select a project, folder, files, feature, workflow, or database area.
Prepare the selected code intelligently.
Detect AI website limitations.
Split large projects into appropriate batches.
Open/use whichever supported AI web application the user chooses.
Send files/code/context one by one or in optimized batches.
Use a carefully designed prompt for each analysis stage.
Collect AI responses.
Validate and normalize those responses.
Build structured project documentation.
Build project architecture knowledge.
Build workflow knowledge.
Build database knowledge.
Build dependency knowledge.
Build feature knowledge.
Compare multiple projects.
Compare the same feature across projects.
Combine documentation from multiple projects.
Send the resulting knowledge back to the AI Project Intelligence system.
The extension must support AI web applications such as:
ChatGPT
Claude
Gemini
Other supported AI web applications

The architecture must allow additional AI websites to be added later.

2. IMPORTANT PRODUCT PRINCIPLE
The Chrome extension is an AI interface, not the project's source of truth.
The source of truth hierarchy remains:
SOURCE CODE
    ↓
VERIFIED PROJECT ANALYSIS
    ↓
PROJECT KNOWLEDGE
    ↓
DOCUMENTATION
    ↓
AI INFERENCE

The Chrome extension must never treat AI-generated text as automatically verified.
AI output must be validated and classified as:
VERIFIED
INFERRED
UNKNOWN

Whenever possible, verified information must be tied back to:
source file
source hash
function
class
component
API
database entity
workflow
project version

3. TECHNOLOGY
Use:
Chrome Extension
Manifest V3
JavaScript
React.js
HTML
CSS
JSON

Do NOT use TypeScript.
Use .js and .jsx.
Recommended structure:
chrome-extension/
│
├── manifest.json
│
├── src/
│   ├── background/
│   │   └── serviceWorker.js
│   │
│   ├── content/
│   │   ├── chatgpt.js
│   │   ├── claude.js
│   │   ├── gemini.js
│   │   └── genericAI.js
│   │
│   ├── bridge/
│   │   └── vscodeBridge.js
│   │
│   ├── ai/
│   │   ├── aiAdapter.js
│   │   ├── chatgptAdapter.js
│   │   ├── claudeAdapter.js
│   │   ├── geminiAdapter.js
│   │   ├── genericAdapter.js
│   │   ├── promptBuilder.js
│   │   ├── contextBuilder.js
│   │   └── responseParser.js
│   │
│   ├── batching/
│   │   ├── tokenEstimator.js
│   │   ├── batchManager.js
│   │   ├── limitDetector.js
│   │   └── contextManager.js
│   │
│   ├── documentation/
│   │   ├── documentationManager.js
│   │   ├── workflowDocumentation.js
│   │   ├── databaseDocumentation.js
│   │   ├── featureDocumentation.js
│   │   └── architectureDocumentation.js
│   │
│   ├── comparison/
│   │   ├── projectComparator.js
│   │   ├── featureComparator.js
│   │   ├── workflowComparator.js
│   │   └── databaseComparator.js
│   │
│   ├── knowledge/
│   │   ├── knowledgeStore.js
│   │   ├── knowledgeMerger.js
│   │   └── schemaValidator.js
│   │
│   ├── ui/
│   │   ├── App.jsx
│   │   ├── components/
│   │   ├── pages/
│   │   └── styles/
│   │
│   └── utils/
│
├── public/
│
└── package.json


4. DEFAULT AI BEHAVIOR
By default, the Chrome extension should use the currently selected/open supported AI web application.
For example:
User is currently on ChatGPT
        ↓
Chrome Extension detects ChatGPT
        ↓
Uses ChatGPT adapter

If the user is on Claude:
User is currently on Claude
        ↓
Chrome Extension detects Claude
        ↓
Uses Claude adapter

If multiple supported AI tabs exist, provide a UI:
AI Provider

● ChatGPT
○ Claude
○ Gemini
○ Other

Allow the user to manually select the provider.

5. DO NOT ASSUME WEBSITE UI
AI websites can change their HTML/UI.
Therefore:
isolate website-specific logic in adapters,
never spread ChatGPT-specific selectors throughout the application,
provide adapter versioning,
detect when selectors fail,
report that the AI website interface has changed,
do not silently send incorrect data.
Architecture:
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

Implement:
ChatGPTAdapter
ClaudeAdapter
GeminiAdapter
GenericAIAdapter


6. VS CODE ↔ CHROME COMMUNICATION
The VS Code extension is responsible for accessing the local project.
The Chrome extension should not assume it can directly access arbitrary local project folders.
Use a secure bridge between VS Code and Chrome.
Preferred architecture:
VS Code Extension
        ↓
Local Bridge / Secure Communication
        ↓
Chrome Extension

The bridge should transfer:
project metadata
selected files
selected folders
selected features
selected workflows
database context
dependency graph
source hashes
existing project knowledge

The Chrome extension should never require the user to manually copy thousands of files if the VS Code extension can provide the context.

7. PROJECT SELECTION
The user should be able to select:
Entire Project
Folder
Multiple Folders
File
Multiple Files
Feature
Workflow
Database Entity
API

Example:
Project:
My E-Commerce Application

Selected:

☑ Authentication
☑ Checkout
☑ Orders
☐ Admin
☐ Reports

Or:
Selected Files:

☑ src/auth/login.jsx
☑ src/auth/authService.js
☑ src/api/auth.js
☑ server/authController.js


8. FEATURE-FIRST ANALYSIS
The user should be able to select a feature instead of manually selecting files.
Example:
Feature:
Checkout

The system should gather:
Checkout components
Checkout services
Checkout APIs
Checkout workflows
Checkout dependencies
Checkout database entities
Checkout tests
Related authentication
Related payment
Related order processing

The system should use the existing Project Intelligence graph from VS Code when available.

9. FILE-BY-FILE AI PROCESSING
The extension must support sequential processing.
Example:
Project
↓
File 1
↓
AI
↓
Response
↓
File 2
↓
AI
↓
Response
↓
File 3
↓
AI

However, do not blindly send every file independently.
Use dependency-aware batching.
For example:
Checkout.jsx
+
useCheckout.js
+
orderService.js
+
orderController.js
+
OrderModel

may be sent together if they are required to understand the workflow.
The system should choose between:
FILE MODE
FEATURE MODE
WORKFLOW MODE
DATABASE MODE
PROJECT MODE

depending on the request.

10. TOKEN/LIMIT MANAGEMENT
The extension must NOT assume that every AI provider has the same limits.
Maintain provider capabilities:
{
  "provider": "chatgpt",
  "contextLimit": "unknown",
  "maxInput": "unknown",
  "maxOutput": "unknown"
}

Where exact limits cannot be reliably detected, allow user configuration.
Settings:
maxTokensPerRequest
maxFilesPerRequest
maxLinesPerFile
maxTotalLines
maxTotalTokens

The extension must estimate token usage before sending.
Display:
Batch 3

Files: 8
Lines: 4,820
Estimated Tokens: 18,300

Status:
READY


11. AUTOMATIC BATCHING
If the selected data is too large:
Project
↓
Context Builder
↓
Token Estimator
↓
Batch Manager

Example:
Batch 1
Authentication

Batch 2
Products

Batch 3
Orders

Batch 4
Payments

Each batch must contain:
projectId
analysisId
batchId
batchNumber
totalBatches
selection
purpose
previousContextReference

The AI must understand that the batches belong to one analysis.

12. DO NOT LOSE CROSS-BATCH CONTEXT
This is critical.
If Batch 1 discovers:
OrderService depends on PaymentService

Batch 2 should know this relationship when analyzing payment.
Maintain a structured intermediate knowledge object:
Batch 1
 ↓
Knowledge Update
 ↓
Batch 2 Context
 ↓
Knowledge Update
 ↓
Batch 3 Context

Do not rely only on previous chat text.
Maintain structured state.

13. BEST PROMPT STRATEGY
Do not send a generic:
"Document this code."
Use specialized prompts.
Examples:
FILE ANALYSIS PROMPT

WORKFLOW ANALYSIS PROMPT

DATABASE ANALYSIS PROMPT

FEATURE ANALYSIS PROMPT

ARCHITECTURE ANALYSIS PROMPT

PROJECT ANALYSIS PROMPT

COMPARISON PROMPT

CHANGE IMPACT PROMPT


14. FILE ANALYSIS PROMPT
Every file analysis should request:
Purpose
Role
Entry Points
Functions
Classes
Components
Inputs
Outputs
Imports
Exports
Dependencies
Dependents
APIs
Database
State
Side Effects
Business Logic
Error Handling
Security
Features
Workflows
Tests
Evidence
Unknowns

AI instructions:
Do not invent information.

If information is not present:
UNKNOWN

If strongly inferred:
INFERRED

If directly supported:
VERIFIED


15. WORKFLOW PROMPT
The workflow prompt should ask:
What starts this workflow?

What does the user do?

Which frontend components participate?

Which functions execute?

Which services execute?

Which APIs are called?

What data is sent?

How is the data validated?

What backend code receives it?

What business logic executes?

Which database entities are read?

Which database entities are modified?

What external services are called?

What response is returned?

How does the frontend process the response?

How does the UI change?

The AI must return a structured workflow.

16. DATABASE PROMPT
The database prompt must focus specifically on:
Database technology
Tables
Collections
Models
Fields
Relationships
Primary keys
Foreign keys
Indexes
Queries
Mutations
Transactions
Data validation
Data transformations
Database access files
Features using entities
Workflows using entities
APIs using entities

Then generate:
UI
↓
API
↓
Service
↓
Database Operation
↓
Entity
↓
Relationship
↓
Result
↓
API
↓
UI


17. PROJECT WORKFLOW ANALYSIS
For a project-level analysis, the AI must understand the application as a system.
Analyze:
Users
↓
Frontend
↓
State
↓
Services
↓
APIs
↓
Backend
↓
Business Logic
↓
Database
↓
External Services
↓
Response
↓
Frontend

Identify major workflows.

18. AI RESPONSE FORMAT
Do not accept arbitrary AI responses as final knowledge.
Prefer structured JSON.
Example:
{
  "analysisType": "workflow",
  "projectId": "project-001",
  "workflowId": "checkout",
  "status": "VERIFIED",
  "files": [],
  "apis": [],
  "databaseEntities": [],
  "steps": [],
  "dataFlow": [],
  "businessRules": [],
  "evidence": [],
  "unknowns": []
}

If JSON parsing fails:
Retry
↓
Request structured correction
↓
Validate

Do not silently save malformed knowledge.

19. DOCUMENTATION ENGINE
The Chrome extension must convert AI responses into the standard .ai-project knowledge structure.
Documentation must include:
Project
Architecture
Features
Workflows
Database
APIs
Dependencies
Files
Business Rules
External Services
Testing
Security
Unknowns

Documentation must be versioned.

20. INCREMENTAL DOCUMENTATION
If the user first analyzes:
auth/

then later:
orders/

do NOT create:
documentation-auth/
documentation-orders/

Instead:
ONE PROJECT
    ↓
ONE KNOWLEDGE BASE
    ↓
Incrementally updated

Create separate analysis sessions for history.
Example:
history/
├── analysis-001
├── analysis-002
└── analysis-003

but maintain:
current project knowledge

as the latest reconciled state.

21. DATABASE KNOWLEDGE MUST BE PRESERVED
When new database information is discovered, merge it with existing database knowledge.
Example:
First analysis:
orders
products

Later analysis discovers:
order_items
payments

Update:
orders
 ├── order_items
 └── payments

order_items
 └── products

Do not create an unrelated database document.

22. PROJECT COMPARISON
The Chrome extension must support:
Project A
Project B

and compare:
Architecture
Features
Workflows
Database
APIs
Dependencies
Authentication
State
Business Rules
External Services
Testing
Security


23. FEATURE COMPARISON
Example:
Project A:
Checkout

Project B:
Checkout

Compare:
User Flow
Frontend Flow
Backend Flow
API
Database
Transactions
Payment
Error Handling
Security
Testing
Dependencies

Return:
Common Approaches
Differences
Architectural Differences
Database Differences
Workflow Differences
Reusable Patterns
Migration Considerations
Unknowns

Do not produce arbitrary scores or rankings.

24. DATABASE COMPARISON
Compare:
Database technology
Schema
Entities
Relationships
Normalization
Queries
Transactions
Indexes
Data ownership
Feature relationships

Example:
Project A:

orders
order_items
products

Project B:

orders
order_lines
product_snapshot

Explain the documented structural differences and their implications.
Do not automatically declare one design universally better.

25. COMBINE PROJECT KNOWLEDGE
Allow:
Project A
+
Project B
+
Project C
+
User Requirements

Generate:
Merged Architecture
Merged Features
Merged Workflows
Merged Database
Merged APIs
Merged Business Rules
Project Blueprint
Implementation Plan

If conflicts exist:
CONFLICT

Project A:
...

Project B:
...

Requires decision:
...

Never silently choose.

26. AI PROVIDER SWITCHING
The user must be able to switch providers.
Example:
AI Provider

● ChatGPT
○ Claude
○ Gemini
○ Other

Provider-specific behavior must be isolated.
The project knowledge format must remain identical regardless of provider.

27. PROVIDER FAILURE
If ChatGPT fails:
ChatGPT
ERROR

Allow:
Switch to Claude

The analysis should continue from the existing knowledge state.
Do not restart the entire project.

28. AI LIMIT DETECTION
Detect common problems:
Context too large
Input limit
Output limit
Rate limit
Authentication failure
Network failure
Website unavailable
Response incomplete
Response truncated
UI changed
Captcha
Login required

When possible, automatically:
Reduce batch
Retry
Continue from checkpoint

Never duplicate already completed batches.

29. CHECKPOINT SYSTEM
After every successful AI response:
Save checkpoint

Example:
{
  "analysisId": "analysis-001",
  "batchId": "batch-004",
  "status": "completed",
  "responseReceived": true,
  "knowledgeMerged": true
}

If Chrome closes or the AI website fails, resume from the last successful checkpoint.

30. AI CONVERSATION MANAGEMENT
Do not create one enormous AI conversation for the entire project if it causes context problems.
Maintain logical sessions:
Project Analysis
Feature Analysis
Workflow Analysis
Database Analysis
Comparison

Each session should have a known purpose.
The extension should maintain its own structured knowledge rather than depending entirely on chat history.

31. CHATGPT / CLAUDE WEBSITE INTERACTION
The extension should:
Detect supported AI website.
Confirm the correct tab.
Prepare the prompt.
Prepare the code/context.
Insert the prompt.
Insert code/context.
Submit.
Wait for response.
Detect completion.
Extract response.
Validate response.
Save checkpoint.
Merge knowledge.
Continue to next batch.
The system must be resilient to UI changes.
If the extension cannot reliably identify the input or response area, stop and tell the user instead of sending data to the wrong location.

32. USER CONTROL
Provide:
Start Analysis
Pause
Resume
Stop
Retry
Skip Batch
Restart Batch
Switch AI

Show:
Project:
My Shop

Analysis:
Checkout

Progress:
Batch 7 / 18

Files:
43 / 102

Status:
Waiting for AI response


33. PRIVACY
The extension must clearly show:
Files being sent
AI provider
Number of files
Estimated tokens
Potential secrets detected

Before starting a large analysis.
Never send excluded files.
Never send detected secrets.
Allow the user to stop the process.

34. SECRET PROTECTION
Even if VS Code already performs secret detection, the Chrome extension must perform a final safety check before sending data to an AI website.
Detect:
API keys
Passwords
Tokens
Private keys
Database credentials
JWT secrets
OAuth credentials
AWS credentials

Replace or remove them:
[REDACTED_SECRET]

Do not send secrets to ChatGPT, Claude, Gemini, or any other provider.

35. PROJECT COVERAGE
Display:
Project Intelligence Coverage

Files:
87 / 350

Features:
9 / 15

Workflows:
8 / 13

Database:
14 / 22

APIs:
31 / 47

Clearly mark:
PARTIAL

if the user has only analyzed part of the project.

36. SOURCE HASHES
Every file sent to AI must carry:
path
sha256
lastModified
projectId

Example:
{
  "path": "src/orders/orderService.js",
  "sha256": "...",
  "projectId": "project-001"
}

This allows the knowledge system to determine whether documentation is still based on the current source.

37. KNOWLEDGE RECONCILIATION
When AI returns information:
AI Response
↓
Validate
↓
Compare with existing knowledge
↓
Detect conflicts
↓
Merge verified information
↓
Mark inferred information appropriately
↓
Update workflows
↓
Update database relationships
↓
Update feature relationships
↓
Update documentation

Never blindly overwrite existing verified knowledge with weaker AI inference.

38. MULTIPLE PROJECTS
The extension must support:
Project A
Project B
Project C

Each has:
projectId

and its own knowledge.
The comparison engine can then combine them without mixing their source data.

39. COMPARISON WORKSPACE
Create:
Comparison Workspace

User can select:
Project A
Project B
Project C

Then:
Compare
├── Architecture
├── Features
├── Workflows
├── Database
├── APIs
├── Dependencies
└── Business Logic


40. EXPORT
Allow export of:
.ai-project/
JSON
Markdown
Project Blueprint
Workflow Documentation
Database Documentation
Comparison Report

The exported knowledge must be usable by the VS Code extension.

41. VS CODE SYNCHRONIZATION
The Chrome extension should be able to send the resulting knowledge back to the VS Code extension.
Example:
Chrome
↓
Documentation generated
↓
Knowledge package
↓
VS Code
↓
Merge
↓
Validate
↓
Save .ai-project/

The VS Code extension remains responsible for the actual project workspace.

42. NO AUTOMATIC CODE MODIFICATION
The Chrome extension must NOT directly modify source code.
Its responsibilities are:
Analyze
Document
Understand
Compare
Generate Architecture
Generate Database Design
Generate Workflows
Generate Project Blueprints
Prepare Change Plans

Actual source-code modification should remain under the VS Code extension.

43. FUTURE CHANGE FLOW
Future architecture:
Chrome
↓
Understand requirement
↓
Analyze documentation
↓
Create change plan
↓
Send change plan to VS Code
↓
VS Code analyzes actual source
↓
VS Code shows diff
↓
User approves
↓
VS Code applies changes
↓
VS Code verifies
↓
VS Code updates project knowledge


44. UI
Create a React UI with:
Dashboard

Current AI
ChatGPT / Claude / Gemini

Project
Selected Project

Selection
Files / Folder / Feature / Workflow

Analysis
Project
Feature
Workflow
Database
Architecture

Progress
Batches
Tokens
Files

Knowledge
Features
Workflows
Database
APIs

Comparison
Projects
Features
Workflows
Database

Export
Sync
Settings


45. ANALYSIS MODES
Provide:
Quick Analysis
Feature Analysis
Workflow Analysis
Database Analysis
Full Project Analysis
Comparison Analysis

Quick Analysis
Small selected files.
Feature Analysis
One feature and its dependencies.
Workflow Analysis
Complete end-to-end workflow.
Database Analysis
Database structure and data flow.
Full Project Analysis
Complete project intelligence.
Comparison Analysis
Compare selected projects.

46. WORKFLOW-FIRST PRIORITY
When analyzing a project, prioritize:
1. Application Workflows
2. Database/Data Flow
3. Features
4. APIs
5. Dependencies
6. Architecture
7. File Documentation

Do not spend most of the AI budget generating repetitive descriptions of individual files.
The goal is understanding how the system works.

47. DATABASE-FIRST QUESTIONS
For important workflows, the AI should answer:
What data enters the workflow?

Where is it validated?

Where is it transformed?

Which API receives it?

Which service processes it?

Which database entity is read?

Which entity is written?

Which relationships are involved?

Is there a transaction?

What happens if the database operation fails?

What is returned to the user?


48. FINAL KNOWLEDGE MODEL
The Chrome extension must ultimately produce:
PROJECT
│
├── FEATURES
│     │
│     └── WORKFLOWS
│            │
│            ├── USER FLOW
│            ├── FRONTEND
│            ├── BACKEND
│            ├── API
│            ├── DATABASE
│            ├── DATA FLOW
│            └── BUSINESS RULES
│
├── DATABASE
│     ├── ENTITIES
│     ├── RELATIONSHIPS
│     ├── QUERIES
│     └── DATA FLOWS
│
├── FILES
│     ├── DEPENDENCIES
│     └── DEPENDENTS
│
├── ARCHITECTURE
│
└── APIS

This is the actual product knowledge.

49. FINAL USER EXPERIENCE
The ideal workflow should be:
Open VS Code
        ↓
Select Project
        ↓
Select Feature / Folder / Workflow
        ↓
Click "Analyze With AI"
        ↓
Chrome Opens / Uses Selected AI
        ↓
Chrome Extension Prepares Context
        ↓
Detects Limits
        ↓
Creates Batches
        ↓
Sends Prompt + Code
        ↓
Reads AI Response
        ↓
Validates Response
        ↓
Updates Knowledge
        ↓
Sends Knowledge Back to VS Code
        ↓
Updates .ai-project/

The user should NOT need to manually copy/paste every file.

50. MOST IMPORTANT REQUIREMENT
The Chrome extension is NOT simply an automated copy/paste tool.
It must intelligently orchestrate AI analysis.
Instead of:
File
→ ChatGPT
→ Documentation

the system should perform:
Project Context
↓
Selection
↓
Dependency Analysis
↓
Workflow Context
↓
Database Context
↓
Token Analysis
↓
Batching
↓
Specialized AI Prompt
↓
AI Analysis
↓
Response Validation
↓
Knowledge Extraction
↓
Knowledge Reconciliation
↓
Workflow Update
↓
Database Update
↓
Feature Update
↓
Documentation Update
↓
Next Batch

The ultimate purpose is to create a reliable AI-readable representation of how the project actually works, especially:
WORKFLOW
+
DATA FLOW
+
DATABASE FLOW
+
ARCHITECTURE
+
FEATURE RELATIONSHIPS

The Chrome extension should then make that knowledge available for:
Understanding Projects
Comparing Projects
Comparing Features
Comparing Workflows
Comparing Database Designs
Finding Reusable Solutions
Creating Project Blueprints
Combining Project Knowledge
Preparing Migration Plans

The Chrome extension must remain focused on AI interaction, documentation, knowledge creation, and comparison.
The VS Code extension remains responsible for:
Actual source project
Filesystem
Source verification
Code changes
Diff
Tests
Build
Final verification

Never allow the Chrome extension to become the authoritative source of project code.