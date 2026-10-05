MASTER DEVELOPMENT PROMPT
VS CODE AI PROJECT INTELLIGENCE EXTENSION
1. ROLE
You are a senior VS Code extension architect, JavaScript/React developer, static-analysis engineer, software architecture analyst, AI orchestration engineer, and developer-tool engineer.
Build a production-quality VS Code extension called AI Project Intelligence.
The extension must understand an actual software project at source-code level and maintain a persistent, structured knowledge base about that project.
The extension must work together with a separate Chrome Extension that communicates with ChatGPT, Claude, Gemini, and other AI websites.
The VS Code extension is the source-of-truth layer.
The Chrome extension is the AI interaction/documentation/comparison layer.
Do not merge these responsibilities.

2. ABSOLUTE TECHNOLOGY REQUIREMENTS
Use:
JavaScript
React.js
JSX
Node.js
VS Code Extension API
HTML
CSS
JSON
DO NOT USE:
TypeScript
.ts
.tsx
All source files must use:
.js
.jsx
.css
.json

The project must remain JavaScript-based from beginning to end.

3. PRODUCT PURPOSE
The primary purpose of the extension is to understand how a software project actually works.
The extension must understand:
Project architecture
Folder structure
Files
Functions
Classes
Components
Imports
Exports
Dependencies
Reverse dependencies
APIs
Routes
Authentication
Authorization
State management
Business logic
Database structure
Database relationships
Database queries
Data flow
Application workflows
Features
External services
Events
Queues
Webhooks
Jobs
Tests
Configuration
Environment references
Security
Deployment configuration
The most important capability is:
UNDERSTAND THE COMPLETE APPLICATION WORKFLOW
Example:
User clicks Place Order
        ↓
Checkout.jsx
        ↓
handlePlaceOrder()
        ↓
orderService.js
        ↓
POST /api/orders
        ↓
orderController
        ↓
orderService
        ↓
validateOrder()
        ↓
calculateTotal()
        ↓
Order Model
        ↓
orders table
        ↓
Order Items
        ↓
products table
        ↓
payment service
        ↓
payment gateway
        ↓
response
        ↓
frontend state
        ↓
Order Confirmation UI

The extension must try to reconstruct the actual flow from source evidence.
Never invent a workflow.

4. CORE PRINCIPLE
The system must follow this source-of-truth hierarchy:
1. SOURCE CODE
2. VERIFIED STATIC ANALYSIS
3. VERIFIED DATABASE/API EVIDENCE
4. PROJECT KNOWLEDGE
5. DOCUMENTATION
6. AI INFERENCE

Source code always has higher authority than AI-generated documentation.
Generated documentation is not the source of truth.

5. HIGH-LEVEL ARCHITECTURE
                        VS CODE EXTENSION
                                │
                                │
                         Actual Project
                                │
              ┌─────────────────┴─────────────────┐
              │                                   │
       Project Scanner                      User Selection
              │                                   │
              └─────────────────┬─────────────────┘
                                ▼
                      Static Code Analysis
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
                       AI Analysis Result
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


6. VS CODE IS THE PRIMARY SYSTEM
VS Code owns:
Filesystem access
Source code
Project scanning
Hashing
Static analysis
Dependency graph
Workflow evidence
Database evidence
Context preparation
Secret detection
Knowledge validation
Knowledge reconciliation
.ai-project
Analysis history
Change planning
Code modifications
Diff generation
Tests
Build
Final verification
Chrome owns:
AI website interaction
AI provider selection
Prompt execution
AI response extraction
AI batching
Documentation generation
Comparison
Blueprint generation
AI knowledge normalization
AI providers provide:
Reasoning
Analysis
Documentation suggestions
Architecture interpretation
Comparison
Blueprint generation

7. PROJECT STRUCTURE
Create the following structure:
ai-project-intelligence/
│
├── package.json
├── README.md
├── CHANGELOG.md
├── LICENSE
│
├── src/
│   │
│   ├── extension.js
│   │
│   ├── commands/
│   │   ├── initializeProject.js
│   │   ├── scanProject.js
│   │   ├── selectFiles.js
│   │   ├── selectFolder.js
│   │   ├── analyzeProject.js
│   │   ├── analyzeWorkflow.js
│   │   ├── analyzeDatabase.js
│   │   ├── analyzeFeature.js
│   │   ├── analyzeDependencies.js
│   │   ├── generateDocumentation.js
│   │   ├── compareProjects.js
│   │   ├── generateBlueprint.js
│   │   ├── analyzeChange.js
│   │   ├── applyChanges.js
│   │   ├── verifyProject.js
│   │   ├── connectChrome.js
│   │   ├── disconnectChrome.js
│   │   └── resumeAnalysis.js
│   │
│   ├── scanner/
│   │   ├── projectScanner.js
│   │   ├── fileScanner.js
│   │   ├── folderScanner.js
│   │   ├── languageDetector.js
│   │   ├── hashCalculator.js
│   │   ├── tokenEstimator.js
│   │   ├── configScanner.js
│   │   ├── packageScanner.js
│   │   └── environmentScanner.js
│   │
│   ├── analyzer/
│   │   ├── fileAnalyzer.js
│   │   ├── symbolAnalyzer.js
│   │   ├── dependencyAnalyzer.js
│   │   ├── reverseDependencyAnalyzer.js
│   │   ├── apiAnalyzer.js
│   │   ├── routeAnalyzer.js
│   │   ├── workflowAnalyzer.js
│   │   ├── databaseAnalyzer.js
│   │   ├── featureAnalyzer.js
│   │   ├── businessLogicAnalyzer.js
│   │   ├── stateAnalyzer.js
│   │   ├── authAnalyzer.js
│   │   ├── externalServiceAnalyzer.js
│   │   └── architectureAnalyzer.js
│   │
│   ├── bridge/
│   │   ├── chromeBridge.js
│   │   ├── bridgeServer.js
│   │   ├── bridgeProtocol.js
│   │   ├── connectionManager.js
│   │   ├── messageManager.js
│   │   ├── requestManager.js
│   │   ├── responseManager.js
│   │   ├── sessionManager.js
│   │   └── securityManager.js
│   │
│   ├── context/
│   │   ├── contextBuilder.js
│   │   ├── contextSelector.js
│   │   ├── dependencyContext.js
│   │   ├── workflowContext.js
│   │   ├── databaseContext.js
│   │   ├── featureContext.js
│   │   ├── projectContext.js
│   │   ├── contextReducer.js
│   │   └── contextValidator.js
│   │
│   ├── knowledge/
│   │   ├── projectStore.js
│   │   ├── knowledgeStore.js
│   │   ├── knowledgeMerger.js
│   │   ├── reconciliationEngine.js
│   │   ├── schemaValidator.js
│   │   ├── evidenceManager.js
│   │   ├── coverageManager.js
│   │   └── versionManager.js
│   │
│   ├── workflows/
│   │   ├── workflowEngine.js
│   │   ├── workflowGraph.js
│   │   ├── workflowTracer.js
│   │   └── workflowStore.js
│   │
│   ├── database/
│   │   ├── databaseDetector.js
│   │   ├── schemaAnalyzer.js
│   │   ├── entityAnalyzer.js
│   │   ├── relationshipAnalyzer.js
│   │   ├── queryAnalyzer.js
│   │   └── dataFlowAnalyzer.js
│   │
│   ├── documentation/
│   │   ├── fileDocumentation.js
│   │   ├── projectDocumentation.js
│   │   ├── workflowDocumentation.js
│   │   ├── databaseDocumentation.js
│   │   ├── featureDocumentation.js
│   │   └── architectureDocumentation.js
│   │
│   ├── comparison/
│   │   ├── projectComparator.js
│   │   ├── featureComparator.js
│   │   ├── workflowComparator.js
│   │   ├── databaseComparator.js
│   │   └── architectureComparator.js
│   │
│   ├── generation/
│   │   ├── blueprintGenerator.js
│   │   ├── projectGenerator.js
│   │   └── migrationGenerator.js
│   │
│   ├── changes/
│   │   ├── changeAnalyzer.js
│   │   ├── changePlanner.js
│   │   ├── impactAnalyzer.js
│   │   ├── diffManager.js
│   │   └── verificationManager.js
│   │
│   ├── security/
│   │   └── secretDetector.js
│   │
│   ├── config/
│   │   └── configManager.js
│   │
│   ├── ui/
│   │   ├── App.jsx
│   │   ├── components/
│   │   ├── pages/
│   │   ├── hooks/
│   │   └── styles/
│   │
│   └── utils/
│       ├── logger.js
│       ├── errors.js
│       ├── paths.js
│       ├── ids.js
│       └── validation.js
│
└── media/
    ├── icon.svg
    └── styles.css


8. VS CODE SIDEBAR
Create an Activity Bar view called:
AI Project Intelligence

Navigation:
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


9. DASHBOARD
Dashboard must display:
Project Name
Project ID
Project Status
Analysis Coverage
Files Analyzed
Files Total
Features
Workflows
Database Entities
APIs
Dependencies
Documentation Status
Chrome Connection
Current AI Provider
Active Analysis
Pending Analyses

Example:
Project: E-Commerce App

Coverage
████████████░░░░ 72%

Files
87 / 120

Workflows
14

Features
9

Database Entities
23

APIs
41

Chrome
● Connected

AI Provider
ChatGPT


10. PROJECT INITIALIZATION
Command:
AI Project: Initialize Project

Create:
.ai-project/

If it already exists:
Load existing project intelligence

Never destroy existing knowledge without explicit user confirmation.

11. .AI-PROJECT STRUCTURE
Use:
.ai-project/
│
├── project.json
├── config.json
│
├── index/
│   ├── files.json
│   ├── symbols.json
│   ├── imports.json
│   ├── exports.json
│   ├── dependencies.json
│   ├── dependents.json
│   ├── routes.json
│   ├── apis.json
│   ├── database.json
│   └── environment.json
│
├── workflows/
│   ├── index.json
│   └── *.json
│
├── database/
│   ├── schema.json
│   ├── entities.json
│   ├── relationships.json
│   ├── queries.json
│   └── data-flows.json
│
├── features/
│   ├── index.json
│   └── *.json
│
├── architecture/
│   ├── overview.md
│   ├── application-flow.md
│   ├── dependency-map.md
│   ├── data-flow.md
│   └── technology-stack.md
│
├── documentation/
│   ├── project-overview.md
│   ├── architecture.md
│   ├── workflows/
│   ├── database/
│   ├── features/
│   └── files/
│
├── comparisons/
│
├── generation/
│   └── project-blueprint.json
│
├── changes/
│
├── snapshots/
│
└── history/
    ├── analysis-001.json
    ├── analysis-002.json
    └── ...


12. PROJECT ID
Each project must have a stable projectId.
Example:
{
  "projectId": "project-001",
  "name": "My Application",
  "schemaVersion": "1.0",
  "analysisVersion": "1.0"
}

Do not identify projects using machine-specific absolute paths.

13. FILE HASHING
Every analyzed source file must have a hash.
Example:
{
  "path": "src/services/orderService.js",
  "hash": "sha256:abc123"
}

Use hashes to determine whether documentation is current.
Statuses:
NOT_ANALYZED
ANALYZED
OUTDATED
PARTIAL


14. INCREMENTAL ANALYSIS
If the user first analyzes:
src/auth/

and later:
src/orders/

do not create separate project documentation sets.
Use:
same projectId
different analysisId

Example:
analysis-001
Authentication

analysis-002
Orders

Merge both into:
.ai-project/

Preserve both analysis sessions in history.

15. COVERAGE
Track:
{
  "coverage": {
    "filesTotal": 350,
    "filesAnalyzed": 87,
    "foldersAnalyzed": 12,
    "workflowsAnalyzed": 8,
    "databaseEntitiesAnalyzed": 14,
    "coverageStatus": "PARTIAL"
  }
}

Never claim the entire project is understood when only part has been analyzed.

16. SCANNING
Scanner must detect:
File tree
Source files
Package files
Configuration
Imports
Exports
Functions
Classes
Components
APIs
Routes
Database references
Environment variables
Tests
Build scripts
Framework configuration
External services
Authentication
Authorization
State management
Events
Queues
Jobs
Webhooks

17. SUPPORTED TECHNOLOGIES
Do not assume a technology.
Detect technologies from actual project evidence.
Support analysis for common systems including:
JavaScript
React
Next.js
Vue
Angular
Node.js
Express
NestJS
Python
Django
Flask
PHP
Laravel
WordPress
Java
Spring
.NET
C#
Ruby
Go

Database detection should support:
MySQL
PostgreSQL
MongoDB
Firebase
Firestore
SQLite
Redis
Supabase
Prisma
Sequelize
Mongoose
TypeORM
Laravel Eloquent
WordPress database
Custom SQL

Add architecture for additional technologies through adapters.

18. DEPENDENCY GRAPH
Build:
File
 ↓
Imports
 ↓
Direct Dependencies
 ↓
Recursive Dependencies
 ↓
Reverse Dependents

Example:
Checkout.jsx
 ├── checkoutService.js
 ├── cartStore.js
 └── PaymentForm.jsx

Reverse:
checkoutService.js
 ├── Checkout.jsx
 └── OrderSummary.jsx

Support configurable dependency depth.

19. SYMBOL ANALYSIS
Detect:
Functions
Classes
Methods
React Components
Hooks
Variables
Constants
Exports
Imports
Interfaces where applicable
Routes
Controllers
Services
Models
Repositories
Database methods

For every symbol record:
name
type
file
location
inputs
outputs
imports
exports
dependencies
dependents


20. API ANALYSIS
Detect:
GET
POST
PUT
PATCH
DELETE
GraphQL
WebSocket
RPC
Server Actions
Firebase calls
WordPress REST API
External APIs

Record:
endpoint
method
request
response
authentication
authorization
validation
controller
service
database
external services


21. DATABASE ANALYSIS
Do not assume the database technology.
Detect it from source evidence.
Analyze:
Tables
Collections
Models
Schemas
Fields
Primary Keys
Foreign Keys
Indexes
Relationships
Queries
Mutations
Joins
Transactions
Constraints
Validation
Migrations

Relationships:
one-to-one
one-to-many
many-to-many

Also map:
Feature → Database
Workflow → Database
API → Database
File → Database
Service → Database


22. DATABASE DATA FLOW
Example:
Checkout.jsx
↓
POST /api/orders
↓
OrderService
↓
orders table INSERT
↓
order_items INSERT
↓
products SELECT
↓
payment transaction
↓
response

Only document relationships supported by source evidence.
If something cannot be verified:
UNKNOWN — database relationship could not be verified


23. WORKFLOW ENGINE
Workflow analysis is the central intelligence feature.
For every workflow determine where possible:
Workflow Name
Purpose
Trigger
User Action
Frontend Entry Point
Frontend Components
Functions
State Changes
API Calls
Backend Entry Point
Controllers
Services
Business Logic
Validation
Database Reads
Database Writes
External Services
Response
Frontend Response Handling
UI Result
Error Handling
Security
Tests
Dependencies
Dependents


24. FEATURE DETECTION
Detect features based on:
Routes
Components
Services
API groups
Database entities
Navigation
Permissions
Business logic
Workflow relationships

Example:
Feature: Checkout

Components:
Checkout.jsx
CartSummary.jsx
PaymentForm.jsx

Services:
cartService.js
orderService.js
paymentService.js

APIs:
POST /api/orders
POST /api/payment

Database:
orders
order_items
payments


25. BUSINESS LOGIC
Identify actual business rules such as:
Discount calculation
Tax calculation
Order validation
Stock validation
Permission checks
Subscription rules
Payment rules
Status transitions
Limits
Eligibility rules

Never invent business rules.

26. AUTHENTICATION AND AUTHORIZATION
Detect:
Login
Signup
Sessions
JWT
OAuth
Cookies
Roles
Permissions
RBAC
ABAC
Middleware
Guards
Protected routes

Map authentication to workflows and APIs.

27. EXTERNAL SERVICES
Detect:
Stripe
PayPal
AWS
Google
Firebase
Twilio
SendGrid
Mail services
Storage providers
Maps
Analytics
Webhooks

Do not assume external services.
Only report what source/configuration evidence supports.

28. EVIDENCE MODEL
Every important analysis item must have:
VERIFIED
INFERRED
UNKNOWN

Example:
{
  "claim": "Order is written to orders table",
  "status": "VERIFIED",
  "evidence": [
    {
      "file": "src/services/orderService.js",
      "symbol": "createOrder",
      "lineStart": 120,
      "lineEnd": 145
    }
  ]
}


29. NEVER INVENT INFORMATION
Never invent:
Files
Functions
APIs
Tables
Columns
Components
Business rules
Relationships
Dependencies
Services
Workflows
Configuration
Environment values
If information is unavailable:
UNKNOWN

If it is a reasonable interpretation but not directly verified:
INFERRED


30. CONTEXT BUILDER
Before sending anything to Chrome, build an intelligent context package.
Context selection priority:
1. User selection
2. Direct dependencies
3. Direct dependents
4. APIs
5. Database entities
6. Related workflows
7. Related features
8. Business logic
9. Tests
10. Existing relevant knowledge

Avoid sending unrelated project files.

31. SECRET DETECTION
Before sending data to Chrome:
Detect:
API keys
Passwords
Tokens
JWT secrets
AWS credentials
OAuth credentials
Private keys
Database credentials
.env secrets
Service-account credentials
Webhook secrets

Replace:
[REDACTED_SECRET]

Never send secrets to Chrome or AI providers.
Use VS Code SecretStorage for extension configuration and credentials.
Never write secrets to logs.

32. CHROME BRIDGE
Create a dedicated bridge between VS Code and Chrome.
The bridge must support:
connection
authentication
pairing
project registration
analysis requests
batch transfer
progress
responses
knowledge packages
errors
pause
resume
cancel
retry
session recovery
heartbeat
reconnection

Preferred transport:
Secure localhost WebSocket

The exact transport can be abstracted behind:
chromeBridge.js

so it can later be replaced without changing the rest of the extension.

33. CHROME PAIRING
Flow:
VS Code
↓
Generate temporary pairing token
↓
Chrome requests connection
↓
User confirms pairing
↓
VS Code validates token
↓
Connection established

Do not create an unauthenticated bridge.
Use:
projectId
sessionId
connectionId
pairingToken

Pairing tokens must expire.

34. BRIDGE PROTOCOL
Every message must contain:
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


35. MESSAGE TYPES
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


36. ANALYSIS SESSION
Every analysis must have:
projectId
analysisId
sessionId

Example:
{
  "projectId": "project-001",
  "analysisId": "analysis-017",
  "mode": "WORKFLOW",
  "selection": {
    "files": [
      "src/components/Checkout.jsx"
    ],
    "folders": [],
    "features": [
      "checkout"
    ],
    "workflows": [
      "place-order"
    ]
  }
}


37. ANALYSIS MODES
Support:
FILE
FOLDER
FEATURE
WORKFLOW
DATABASE
PROJECT
DOCUMENTATION
COMPARISON
BLUEPRINT


38. ANALYSIS PACKAGE
VS Code sends Chrome:
{
  "packageType": "PROJECT_ANALYSIS",
  "schemaVersion": "1.0",

  "project": {
    "projectId": "project-001",
    "name": "My Application"
  },

  "analysis": {
    "analysisId": "analysis-017",
    "mode": "WORKFLOW",
    "purpose": "Analyze checkout workflow"
  },

  "selection": {
    "files": [],
    "folders": [],
    "features": [
      "checkout"
    ],
    "workflows": [
      "place-order"
    ]
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


39. FILE CONTEXT
Each file must contain:
{
  "path": "src/services/orderService.js",
  "language": "javascript",
  "hash": "sha256:abc123",
  "content": "...",
  "symbols": [],
  "imports": [],
  "exports": [],
  "dependencies": [],
  "dependents": []
}


40. TOKEN-AWARE BATCHING
Before transferring context:
estimate tokens
↓
compare against configured limits
↓
create batches

Configuration:
aiProject.maxTokensPerFile
aiProject.maxTotalTokens
aiProject.maxFiles
aiProject.maxLinesPerFile
aiProject.maxTotalLines
aiProject.maxDependencyDepth
aiProject.maxWorkflowDepth


41. BATCH MODEL
Example:
{
  "analysisId": "analysis-017",
  "batchId": "batch-004",
  "batchNumber": 4,
  "totalBatches": 5,
  "purpose": "database analysis",
  "selection": {},
  "context": {},
  "previousContextReference": "batch-003"
}


42. CROSS-BATCH KNOWLEDGE
Do not depend entirely on AI chat history.
Maintain structured state:
knownFiles
knownSymbols
knownAPIs
knownDatabaseEntities
knownWorkflows
knownFeatures
knownBusinessRules
knownDependencies
unknowns
previousFindings

Send only relevant previous context to later batches.

43. CHROME AI PROVIDERS
Chrome must support:
ChatGPT
Claude
Gemini
Generic AI

VS Code must not contain website-specific selectors.
Chrome is responsible for AI website interaction.

44. AI RESPONSE
Chrome should return structured knowledge rather than raw AI text.
Example:
{
  "packageType": "KNOWLEDGE_PACKAGE",

  "schemaVersion": "1.0",

  "projectId": "project-001",

  "analysisId": "analysis-017",

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


45. KNOWLEDGE VALIDATION
When Chrome sends knowledge:
Chrome
↓
Schema validation
↓
Source verification
↓
Hash verification
↓
Dependency verification
↓
Reconciliation
↓
Save

AI output must never be saved blindly.

46. KNOWLEDGE RECONCILIATION
Rules:
Verified source information wins.
New verified information is added.
Existing unaffected information remains.
Conflicts are flagged.
Unknown remains unknown.
Outdated information is marked outdated.


47. DOCUMENTATION GENERATION
Generate file documentation containing:
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
Configuration
Security
Features
Workflows
Data Flow
Tests
Risks
Evidence
Source Hash
Documentation Status


48. WORKFLOW DOCUMENTATION
Every workflow document must include:
Workflow Name
Purpose
Trigger
User Journey
Frontend Flow
Backend Flow
API Flow
Database Flow
Data Transformation
Business Rules
External Services
Files
Functions
Database Entities
Dependencies
Dependents
Error Handling
Security
Tests
Evidence
Unknowns
Change Impact


49. DATABASE DOCUMENTATION
Every database entity must document:
Entity Name
Purpose
Type
Fields
Relationships
Features
Workflows
Queries
Mutations
Files
Services
APIs
Business Rules
Indexes
Constraints
Transactions
Security
Evidence
Unknowns


50. ARCHITECTURE DOCUMENTATION
Generate:
Project Overview
Architecture Overview
Application Flow
Frontend Architecture
Backend Architecture
API Architecture
Database Architecture
Data Flow
Dependency Map
Authentication
Authorization
External Services
Technology Stack
Testing Architecture
Deployment Architecture


51. MULTI-SYSTEM SUPPORT
The project intelligence must be portable.
Recommended:
Git Repository
├── source
└── .ai-project

Never store machine-specific absolute paths as authoritative project references.
Use project-relative paths.
Multiple computers can analyze the same project.
If multiple systems create analysis sessions:
preserve history
reconcile knowledge
do not blindly overwrite


52. PROJECT COMPARISON
Allow comparing:
Project A
Project B
Project C

Compare:
Technology
Architecture
Folder Structure
Features
Workflows
Database
APIs
Frontend Flow
Backend Flow
Data Flow
Business Rules
Authentication
Authorization
State Management
Dependencies
External Services
Testing
Security
Deployment

Do not rank or score projects.
Return:
Common Approaches
Differences
Architectural Differences
Database Differences
Workflow Differences
Reusable Patterns
Migration Considerations
Unknowns


53. FEATURE COMPARISON
Compare the same feature across projects:
User Flow
Frontend
Backend
API
Database
Data Flow
Business Rules
Error Handling
Security
Testing
Dependencies
External Services


54. WORKFLOW COMPARISON
Compare:
Trigger
Frontend Flow
API Flow
Backend Flow
Database Flow
Business Rules
External Services
Error Handling
Security
Testing
Dependencies


55. BLUEPRINT GENERATION
Allow:
Project A Knowledge
+
Project B Knowledge
+
Project C Knowledge
+
User Requirements

to produce a new project blueprint.
The blueprint must include:
Purpose
Technology Stack
Architecture
Modules
Features
Workflows
Database
Relationships
APIs
Business Rules
External Services
Authentication
Authorization
State Management
Folder Structure
Components
Services
Models
Environment Requirements
Build Commands
Test Commands
Deployment Commands

Store:
.ai-project/generation/project-blueprint.json


56. CONFLICT HANDLING
If projects disagree:
Project A says X
Project B says Y

Do not silently choose one.
Record:
CONFLICT

with:
source
claim
evidence
affected areas


57. SAFE CODE MODIFICATION
Actual code changes remain entirely inside VS Code.
Flow:
AI
↓
Change Proposal
↓
Dependency Impact
↓
Feature Impact
↓
Workflow Impact
↓
Database Impact
↓
Risk
↓
Diff
↓
User Approval
↓
Apply
↓
Tests
↓
Lint
↓
Typecheck where applicable
↓
Build
↓
Rescan
↓
Update Documentation

Never automatically modify source code without explicit user approval.

58. CHANGE HASH VALIDATION
Before applying a proposed change:
expected file hash
        ↓
current file hash
        ↓
compare

If different:
FILE CHANGED SINCE ANALYSIS

Stop and re-analyze.
Never apply stale changes automatically.

59. TESTING AFTER CHANGES
After approved modifications:
Run available project checks:
Tests
Lint
Build
Validation

Detect commands from:
package.json
project configuration
framework configuration

Do not assume commands.

60. RESCAN AFTER CHANGES
After successful modification:
Rescan changed files
↓
Recalculate hashes
↓
Update dependency graph
↓
Update workflows
↓
Update database relationships
↓
Update features
↓
Update documentation


61. ANALYSIS HISTORY
Store:
analysisId
projectId
timestamp
selection
files
hashes
mode
status
batches
provider
knowledge changes
coverage changes

Example:
history/
├── analysis-001.json
├── analysis-002.json
├── analysis-003.json


62. CHECKPOINTING
After every successful batch:
save checkpoint

Checkpoint includes:
analysisId
batchId
status
response received
knowledge merged
timestamp

If Chrome closes:
resume

Skip completed batches.

63. CONNECTION RECOVERY
If Chrome disconnects:
save state
show disconnected status
allow reconnect
resume from checkpoint

Never lose completed analysis.

64. PROGRESS UI
Show:
Analysis: Checkout Workflow

Batch 3 / 7

Files:
24 / 41

Estimated tokens:
18,400

Status:
Analyzing database

Chrome:
Connected

Provider:
ChatGPT


65. USER CONTROLS
During analysis support:
Pause
Resume
Cancel
Retry
Skip
Restart
Switch Provider


66. SETTINGS
Support:
aiProject.provider
aiProject.model
aiProject.apiKey
aiProject.maxTokens
aiProject.maxFiles
aiProject.maxLinesPerFile
aiProject.maxTotalLines
aiProject.maxTokensPerFile
aiProject.maxTotalTokens
aiProject.maxDependencyDepth
aiProject.maxWorkflowDepth
aiProject.maxDocumentationDepth
aiProject.excludePatterns
aiProject.autoScan
aiProject.autoUpdateDocumentation
aiProject.detectSecrets
aiProject.aiProjectFolder
aiProject.saveHistory
aiProject.requireApprovalForChanges
aiProject.chromeBridgePort
aiProject.chromeBridgeHost

Use VS Code SecretStorage for sensitive credentials.

67. EXCLUSIONS
Allow users to exclude:
Files
Folders
Extensions
Patterns

Presets:
Node.js
React
Next.js
Vue
Angular
Python
PHP
Laravel
WordPress
Java
.NET

Example:
node_modules
.git
.next
dist
build
coverage
.env
*.log

Never force exclusions without allowing configuration.

68. FILE SELECTION
Allow:
Select File
Select Multiple Files
Select Folder
Select Multiple Folders
Select Feature
Select Workflow
Select Database Entity
Select API
Select Entire Project

The user must always be able to perform partial analysis.

69. PARTIAL KNOWLEDGE
If a referenced dependency was not analyzed:
NOT_ANALYZED

Do not infer its implementation.
Example:
Checkout.jsx
↓
paymentService.js

paymentService.js
NOT_ANALYZED

Do not invent what paymentService.js does.

70. DOCUMENTATION STATUS
Every documentation item should have:
ANALYZED
OUTDATED
PARTIAL
NOT_ANALYZED

If source hash changes:
DOCUMENTATION OUTDATED


71. FILE DOCUMENTATION RELATIONSHIPS
Documentation should link files to:
Features
Workflows
APIs
Database entities
Dependencies
Dependents
Tests
External services

This creates a project knowledge graph.

72. KNOWLEDGE GRAPH
Internally model relationships such as:
Project
 ├── Feature
 │    ├── Workflow
 │    │    ├── File
 │    │    ├── Function
 │    │    ├── API
 │    │    └── Database Entity
 │    │
 │    ├── Component
 │    └── Service
 │
 ├── Database
 ├── API
 ├── Dependency
 └── External Service


73. COMMANDS
Register:
AI Project: Initialize Project
AI Project: Scan Project
AI Project: Select Files
AI Project: Select Folder
AI Project: Configure Exclusions

AI Project: Analyze Selection
AI Project: Analyze Dependencies
AI Project: Analyze Workflows
AI Project: Analyze Database
AI Project: Detect Features

AI Project: Generate Documentation
AI Project: Update Documentation
AI Project: Rebuild Documentation

AI Project: Show Architecture
AI Project: Show Workflow
AI Project: Show Database Flow
AI Project: Show Dependency Graph

AI Project: Compare Projects
AI Project: Compare Features
AI Project: Compare Workflows
AI Project: Compare Databases

AI Project: Generate Project Blueprint
AI Project: Create Project From Blueprint

AI Project: Analyze Change
AI Project: Generate Change Plan
AI Project: Review AI Changes
AI Project: Apply AI Changes

AI Project: Verify Project

AI Project: Pair Chrome
AI Project: Connect Chrome
AI Project: Disconnect Chrome
AI Project: Show Chrome Status
AI Project: Resume Analysis


74. EXTENSION ACTIVATION
On activation:
Load configuration
↓
Detect workspace
↓
Load .ai-project if present
↓
Initialize project state
↓
Initialize UI
↓
Initialize Chrome bridge
↓
Register commands

Do not automatically scan the entire project unless the user has enabled automatic scanning.

75. ERROR HANDLING
Handle:
Chrome unavailable
Connection timeout
Pairing failure
Invalid message
Malformed AI response
AI context too large
Rate limit
Provider unavailable
Network failure
Disconnected browser
Source file changed
Hash mismatch
Schema mismatch
Knowledge conflict
Analysis failure
File permission failure
Unsupported project

Errors must be understandable to developers.

76. LOGGING
Use structured logs.
Example:
[AI-PROJECT]
[BRIDGE]
[ANALYSIS]
[KNOWLEDGE]
[WORKFLOW]
[DATABASE]
[SECURITY]
[CHANGE]

Never log:
API keys
Passwords
Tokens
Secrets
Private keys
Credentials


77. PERFORMANCE
Do not load entire projects into memory unnecessarily.
Use:
lazy scanning
incremental scanning
hash-based change detection
streaming where appropriate
bounded concurrency
token estimation
dependency filtering

Large repositories must remain usable.

78. UI IMPLEMENTATION
The VS Code UI should use React.js.
Build a reusable component system:
Dashboard
ProjectHeader
CoverageCard
AnalysisProgress
FileTree
DependencyGraph
WorkflowViewer
DatabaseViewer
FeatureViewer
DocumentationViewer
ChromeConnection
AnalysisQueue
ComparisonViewer
BlueprintViewer
ChangeReview
DiffViewer
SettingsPanel


79. WORKFLOW VIEWER
Show:
Trigger
↓
Frontend
↓
State
↓
API
↓
Backend
↓
Business Logic
↓
Database
↓
External Service
↓
Response
↓
UI

Allow clicking each step to show:
file
symbol
evidence
dependencies
status


80. DATABASE VIEWER
Show:
Entities
Relationships
Queries
Mutations
Features
Workflows

Example:
users
   │
   ├── orders
   │      │
   │      └── order_items
   │
   └── addresses

Only display relationships supported by evidence.

81. DEPENDENCY VIEWER
Support:
File → Dependencies
File → Dependents
Feature → Dependencies
Workflow → Dependencies

Allow configurable depth.

82. DOCUMENTATION VIEWER
Allow:
Preview
Open
Refresh
Regenerate
Compare versions

Never overwrite documentation without preserving the appropriate history.

83. CHROME STATUS UI
Display:
Chrome Bridge

Status: Connected
Provider: ChatGPT
Session: session-001
Project: project-001

Current Analysis:
Checkout Workflow

Batch:
4 / 7

[Pause]
[Cancel]
[Reconnect]


84. SECURITY MODEL
The extension must:
Minimize data sent externally
Redact secrets
Use secure pairing
Validate Chrome messages
Validate AI knowledge
Verify file hashes
Require approval for source changes
Avoid machine-specific credentials
Avoid storing secrets in .ai-project
Avoid logging secrets

85. CHROME TRUST MODEL
Treat Chrome as an external client.
Every incoming Chrome message must be validated.
Do not trust:
file paths
project IDs
analysis IDs
knowledge claims
change proposals

without validation.
Normalize paths and prevent path traversal.
Never allow Chrome to request arbitrary filesystem access.
VS Code decides what files can be read.

86. KNOWLEDGE TRUST MODEL
AI-generated claims are untrusted until validated.
Example:
AI says:
users table has phone_number

VS Code checks source evidence.
If verified:
VERIFIED

If not:
UNKNOWN

Never convert an unsupported AI statement into verified knowledge.

87. PROJECT BLUEPRINT TRUST
Blueprints are planning artifacts.
They are not source code.
Never automatically create or modify source files from a blueprint.
Project creation must require explicit user action.

88. FUTURE EXTENSIBILITY
Design the architecture so future features can be added:
Cloud Project Intelligence
Team Knowledge
Project Sharing
Remote Analysis
CI/CD Analysis
GitHub Integration
GitLab Integration
Bitbucket Integration
Issue Tracking
Architecture Visualization
AI Agents
Automated Documentation Updates

Do not hard-code the system around one AI provider.

89. PROVIDER INDEPENDENCE
VS Code should never depend directly on:
ChatGPT selectors
Claude selectors
Gemini selectors

VS Code only knows:
Chrome Bridge

Chrome handles provider-specific implementation.
This allows future AI providers without changing the VS Code extension architecture.

90. DEVELOPMENT PHASES
Implement incrementally.
PHASE 1
Build:
VS Code extension shell
React UI
Activity Bar
Dashboard
Commands
Project initialization
Configuration

Extension must run successfully.

PHASE 2
Build:
Project scanner
File scanner
Folder scanner
Language detection
Hashing
Token estimation
Exclusions


PHASE 3
Build:
Symbol analyzer
Dependency analyzer
Reverse dependency analyzer
API analyzer
Route analyzer


PHASE 4
Build:
Chrome bridge
Pairing
WebSocket/local communication
Message protocol
Connection management
Heartbeat
Reconnect


PHASE 5
Build:
Context builder
Dependency-aware context
Token-aware batching
Secret detection


PHASE 6
Build:
Knowledge schemas
Validation
Evidence model
Knowledge reconciliation
History
Coverage


PHASE 7
Build:
File documentation
Project documentation
Architecture documentation


PHASE 8
Build:
Workflow engine
Workflow tracing
Workflow documentation
Workflow UI


PHASE 9
Build:
Database detection
Schema analysis
Entity analysis
Relationship analysis
Query analysis
Database data flow


PHASE 10
Build:
Feature detection
Feature knowledge
Feature UI


PHASE 11
Build:
Comparison
Project comparison
Feature comparison
Workflow comparison
Database comparison
Architecture comparison


PHASE 12
Build:
Blueprint generation
Project generation planning


PHASE 13
Build:
Change analyzer
Impact analyzer
Diff generation
User approval
Safe modification
Testing
Rescan


PHASE 14
Build:
Multi-system support
Git-compatible .ai-project
Session reconciliation


91. AFTER EACH PHASE
After every phase:
Extension must build
Extension must activate
Extension must not crash
Existing features must continue working
No TypeScript must be introduced
No architecture regression


92. CODE QUALITY
Use:
modular architecture
small modules
clear interfaces
dependency injection where useful
centralized error handling
structured logging
schema validation
unit-testable services

Avoid:
giant files
giant functions
global state everywhere
hard-coded paths
hard-coded AI provider logic
duplicated bridge logic
duplicated knowledge logic


93. FINAL SYSTEM FLOW
The final system must support this workflow:
User opens VS Code
        ↓
Open Project
        ↓
Initialize / Load .ai-project
        ↓
Scan Project
        ↓
Select Folder / File / Feature / Workflow
        ↓
VS Code analyzes source
        ↓
Build dependency-aware context
        ↓
Detect secrets
        ↓
Estimate tokens
        ↓
Create analysis batches
        ↓
Connect to Chrome
        ↓
Send ANALYSIS_REQUEST
        ↓
Chrome opens/uses selected AI provider
        ↓
Chrome prepares AI prompt
        ↓
AI analyzes source
        ↓
Chrome validates response
        ↓
Chrome creates KNOWLEDGE_PACKAGE
        ↓
Chrome sends package to VS Code
        ↓
VS Code validates package
        ↓
VS Code verifies source evidence
        ↓
VS Code reconciles knowledge
        ↓
Update .ai-project
        ↓
Update documentation
        ↓
Update coverage
        ↓
Save analysis history


94. IMPORTANT ARCHITECTURAL RULE
Never make the Chrome extension the source of truth.
The correct ownership model is:
VS CODE
=
SOURCE CODE
+
STATIC ANALYSIS
+
PROJECT KNOWLEDGE
+
SOURCE VERIFICATION
+
CODE CHANGES
+
TESTING
+
FINAL RECONCILIATION

CHROME
=
AI WEB INTERACTION
+
AI PROVIDER MANAGEMENT
+
DOCUMENTATION GENERATION
+
COMPARISON
+
BLUEPRINT GENERATION
+
AI RESPONSE NORMALIZATION

AI PROVIDER
=
REASONING
+
ANALYSIS
+
DOCUMENTATION SUGGESTIONS

.ai-project/
=
PERSISTENT PROJECT INTELLIGENCE


95. FINAL SUCCESS CRITERIA
The implementation is successful only when the following are possible:
A. Project understanding
Open project
↓
Scan
↓
Understand architecture

B. Partial analysis
Analyze auth folder
↓
Save knowledge

C. Incremental analysis
Analyze orders folder later
↓
Merge with auth knowledge

D. Workflow understanding
Select checkout
↓
Understand frontend → API → backend → DB → payment → response

E. Database understanding
Understand tables
↓
Relationships
↓
Queries
↓
Workflow data flow

F. Chrome AI integration
VS Code
↓
Chrome
↓
ChatGPT / Claude / Gemini
↓
Chrome
↓
VS Code

G. Documentation
Generate
↓
Validate
↓
Save
↓
Update incrementally

H. Comparison
Project A
+
Project B
↓
Comparison

I. New project planning
Project A
+
Project B
+
Requirements
↓
Project Blueprint

J. Safe modification
AI proposal
↓
Impact analysis
↓
Diff
↓
User approval
↓
Apply
↓
Test
↓
Rescan
↓
Update knowledge


96. IMPLEMENTATION INSTRUCTION
Do not only create placeholder files.
Implement the system progressively.
Start with Phase 1 and Phase 2, but create the architecture so later phases can plug into it.
At every phase:
Create actual working code.
Keep JavaScript only.
Keep React UI functional.
Keep the extension runnable.
Do not fake source analysis as completed functionality.
Do not claim unsupported analysis capabilities.
Use clear TODO markers only where a future phase is intentionally incomplete.
Keep interfaces stable between modules.
Add validation around all external input.
Preserve .ai-project compatibility as the system evolves.
The final result must be a real, modular VS Code developer tool rather than a static UI prototype.
The extension must be designed from the beginning for the future Chrome extension integration described above.