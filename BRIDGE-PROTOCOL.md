# Bridge Protocol v1.0

How the **AI Project Intelligence** VS Code extension and the **AI Project Bridge** Chrome extension talk to each other. VS Code is the server and the source of truth; Chrome is a client that talks to AI websites.

- Protocol id: `ai-project` · version: `1.0` (`protocolVersion`)
- Transport: WebSocket on **`127.0.0.1` only** (default port `47821`, setting `aiProject.chromeBridgePort`)
- Encoding: one JSON message per WebSocket text frame, max 32 MB
- Reference implementations: `vscode-extension/src/bridge/` and `chrome-extension/src/bridge/`

## 1. Connection

1. VS Code starts listening on the configured port, or the next free one if another VS Code window already uses it (up to 10 ports), when you run **Pair Chrome** or **Connect Chrome**, or automatically at startup if a browser was paired before (so it can reconnect).
2. Chrome opens `ws://127.0.0.1:<port>`.
3. The handshake accepts **only `chrome-extension://<32 letters a-p>` origins**. Web pages (`http(s)://…`) and clients with no origin are refused at the HTTP upgrade.
4. Until authenticated, a connection may only send `PAIR_REQUEST`, `SESSION_RESUME` or `PING`. Anything else gets `ERROR UNAUTHENTICATED`; repeated violations close the socket (code 4003). Five failed handshakes from one address block it for 60 s.
5. The connection is rate limited (about 200 messages/s, burst 400).
6. VS Code sends `PING` every 15 s; a connection silent for 45 s is dropped. Chrome answers `PONG` and reconnects with backoff (1 s … 30 s).

Only one Chrome connection is active at a time; a newly authenticated one replaces the old (close code 4005).

## 2. Pairing

```
VS Code                               Chrome
  │ "Pair Chrome": create token         │
  │   12 chars, valid 2 min, single use │
  │   shown as "<port>-<token>"         │
  │                                     │ user types token + port
  │◄──────── PAIR_REQUEST ──────────────│  { pairingToken, clientName, clientVersion, protocolVersion }
  │ validate token, project, version    │
  │ ask the USER to Allow (modal)       │
  │─────── PAIR_RESPONSE ──────────────►│  { accepted:true, connectionId, sessionId, sessionKey, projectId, projectName, protocolVersion }
  │─────── PROJECT_REGISTER ───────────►│  { projectId, name, schemaVersion, coverage }
```

- Chrome accepts `<port>-<token>` (the port is not secret) or a bare token plus a port field.
- A pairing is per project. Chrome keeps one pairing at a time; pairing to another project suspends the first project's unfinished analyses locally (see Session recovery).
- `sessionKey` is a secret. Chrome stores it in `chrome.storage.local`; VS Code stores **only its SHA-256** (in VS Code SecretStorage). Comparison is constant-time.
- Failure responses: `{ accepted:false, code, message }` with `code` = `PAIRING_FAILED` (unknown token), `TOKEN_EXPIRED`, `PAIRING_REJECTED` (user declined), `PROTOCOL_MISMATCH`, `PROJECT_MISMATCH`.
- Tokens are never logged. A used or expired token cannot be reused.

## 3. Envelope

Every message:

```json
{
  "protocol": "ai-project",
  "protocolVersion": "1.0",
  "messageId": "msg-1a2b3c4d5e6f",
  "messageType": "ANALYSIS_REQUEST",
  "sessionId": "session-…",
  "projectId": "project-…",
  "timestamp": "2026-09-30T12:00:00Z",
  "payload": {},
  "inReplyTo": "msg-…"
}
```

`inReplyTo` is optional. After authentication, `sessionId` must equal the connection's session and `projectId` must equal the open project, otherwise `ERROR SESSION_MISMATCH` / `PROJECT_MISMATCH`. A retransmitted `messageId` is not processed twice: VS Code replays the replies it produced the first time.

## 4. Messages

Direction: **V→C** VS Code to Chrome, **C→V** Chrome to VS Code.

| Type | Dir | Payload |
|---|---|---|
| `PAIR_REQUEST` / `PAIR_RESPONSE` | C→V / V→C | see §2 |
| `SESSION_RESUME` | C→V | `{ connectionId, sessionKey }` |
| `SESSION_RESUME_RESPONSE` | V→C | `{ accepted, connectionId, sessionId, projectId, resumable:[{ analysisId, completedBatchIds, totalBatches, status }] }` or `{ accepted:false, code, message }` |
| `PROJECT_REGISTER` / `_RESPONSE` | V→C / C→V | `{ projectId, name, schemaVersion, coverage }` / `{ accepted, projectId }` |
| `ANALYSIS_REQUEST` | V→C | `{ analysisId, mode, purpose, intent, providerHint, resume, totalBatches, completedBatchIds, estimatedTokens, files:[{path,hash}], secretsRedacted, secrets:[{file,type,line}] }` (no file contents, no secret values) |
| `ANALYSIS_ACCEPTED` | C→V | `{ analysisId, accepted, provider, reason?, resumed? }`, sent **only after the user confirms in Chrome** |
| `ANALYSIS_BATCH` | V→C | batch object (§5.2), one at a time |
| `ANALYSIS_BATCH_ACK` | C→V | `{ analysisId, batchId, received }` |
| `ANALYSIS_PROGRESS` | C→V | `{ analysisId, batchId, stage, provider }` |
| `AI_RESPONSE` | C→V | `{ analysisId, batchId, status:"COMPLETED"\|"FAILED", knowledge?, error?, code?, provider, model }` |
| `AI_RESPONSE_ACK` | V→C | `{ analysisId, batchId, checkpointed, failed? }` |
| `ANALYSIS_COMPLETE` | C→V | `{ analysisId, status:"COMPLETED"\|"PARTIAL", batchesCompleted, totalBatches }` |
| `KNOWLEDGE_PACKAGE` | C→V | `{ package }` (§5.3) |
| `KNOWLEDGE_MERGE_REQUEST` | C→V | `{ package }`, same processing as `KNOWLEDGE_PACKAGE` |
| `KNOWLEDGE_PACKAGE_ACK` | V→C | `{ analysisId, accepted:true, counts:{VERIFIED,INFERRED,UNKNOWN}, stale, rejected }` or `{ accepted:false, code, errors }` |
| `KNOWLEDGE_MERGE_RESULT` | V→C | `{ analysisId, changes, conflicts, unverified, coverage }` |
| `DOCUMENTATION_REQUEST` / `_RESPONSE` | V→C / C→V | `{ key, kind, knowledge }` / `{ key, kind, markdown, provider }`. Both sides implement it; no VS Code command sends it yet |
| `COMPARISON_REQUEST` / `_RESPONSE` | V→C / C→V | `{ kind, projects, structural, selection, instructions }` / `{ kind, projects:[{projectId,name}], result, conflicts, provider }` |
| `BLUEPRINT_REQUEST` / `_RESPONSE` | V→C / C→V | `{ projects, requirements, instructions }` / `{ projects, requirements, blueprint, provider }` |
| `CHANGE_PROPOSAL` | C→V | `{ title, rationale, analysisId, changes:[{ path, operation:"MODIFY"\|"CREATE"\|"DELETE", expectedHash, edits:[{find,replace}] \| newContent }] }` |
| `PAUSE_REQUEST` `RESUME_REQUEST` `CANCEL_REQUEST` `RETRY_REQUEST` | both | `{ analysisId, batchId?, skip? }` (`RETRY_REQUEST` with `skip:true` from Chrome means "skip this batch") |
| `ERROR` / `WARNING` | both | `{ code, message, details? }`. `WARNING` is also used for informational results such as `CHANGE_PROPOSAL_RECEIVED`, `COMPARISON_STORED`, `BLUEPRINT_STORED` |
| `PING` / `PONG` | both | `{ nonce? }` |

## 5. Schemas

### 5.1 Analysis modes and intent
`mode`: `FILE`, `FOLDER`, `FEATURE`, `WORKFLOW`, `DATABASE`, `PROJECT` (plus `DOCUMENTATION`, `COMPARISON`, `BLUEPRINT` as job kinds).
`intent`: `UNDERSTAND` (default), `CHANGE_IMPACT`, `CHANGE_PLAN`.

### 5.2 Batch (`ANALYSIS_BATCH`)
```json
{
  "analysisId": "analysis-001", "batchId": "batch-001", "batchNumber": 1, "totalBatches": 3,
  "purpose": "folder analysis: …", "selection": { "files": [], "folders": [], "features": [], "workflows": [] },
  "previousContextReference": null, "estimatedTokens": 1200,
  "crossBatchFindings": [ { "batchId": "batch-001", "knowledge": {} } ],
  "context": {
    "project": { "projectId": "…", "name": "…" }, "projectOverview": {}, "analysis": { "analysisId": "…", "mode": "FOLDER", "purpose": "…", "intent": "UNDERSTAND" },
    "files": [ { "path": "src/a.js", "language": "javascript", "hash": "sha256:…", "content": "…(secrets replaced by [REDACTED_SECRET])…", "truncated": false, "relation": "selected|dependency|dependent",
                 "symbols": [], "imports": [], "exports": [], "dependencies": [], "dependents": [] } ],
    "symbols": [], "dependencies": [], "apis": [], "clientApiCalls": [], "database": {}, "workflows": [], "features": [],
    "existingKnowledge": {}, "crossBatch": { "knownFiles": [], "knownSymbols": [], "knownAPIs": [], "knownDatabaseEntities": [], "knownWorkflows": [], "knownFeatures": [], "knownDependencies": [], "unknowns": [], "previousFindings": [] },
    "instructions": { "sourceOfTruth": "SOURCE_CODE", "doNotInvent": true, "useEvidenceLabels": true }
  }
}
```
`hash` is the SHA-256 of the **original** file (before redaction). Chrome copies it into evidence; the AI never supplies hashes.

### 5.3 Knowledge package (`KNOWLEDGE_PACKAGE`)
```json
{
  "packageType": "KNOWLEDGE_PACKAGE", "schemaVersion": "1.0",
  "projectId": "project-…", "analysisId": "analysis-001",
  "source": { "provider": "chatgpt", "model": "…" },
  "knowledge": {
    "files": [ { "path": "", "sha256": "", "purpose": "", "role": "", "claims": [Claim], "unknowns": [] } ],
    "features": [ { "id": "", "name": "", "purpose": "", "files": [], "claims": [Claim] } ],
    "workflows": [ { "id": "", "name": "", "purpose": "", "api": { "method": "", "endpoint": "" }, "steps": [ { "kind": "", "file": "", "symbol": "", "description": "", "status": "" } ], "businessRules": [Claim], "claims": [Claim] } ],
    "database": { "entities": [ { "name": "", "purpose": "", "fields": [ { "name": "", "type": "", "evidence": [Evidence] } ], "claims": [Claim] } ],
                  "relationships": [ { "from": "", "to": "", "type": "", "evidence": [Evidence] } ] },
    "architecture": { "overview": "", "claims": [Claim] },
    "dependencies": [ { "from": "path", "to": "path" } ]
  },
  "evidence": [Claim], "unknowns": []
}
Claim    = { "claim": "text", "status": "VERIFIED|INFERRED|UNKNOWN", "subject": "identifier?", "evidence": [Evidence] }
Evidence = { "file": "path", "symbol": "name?", "lineStart": 1, "lineEnd": 5, "sha256": "sha256:…" }
```

### 5.4 What VS Code does with a package (never trusts it)
1. Schema validation (types, sizes, statuses). Wrong `projectId` → `PROJECT_MISMATCH`; unknown `analysisId` → `ANALYSIS_UNKNOWN`.
2. Every path is normalized and must exist in the scanned project. `..` and absolute paths are rejected.
3. `sha256` values are compared with the current file hashes; mismatch → the item is **stale** and the file is **not** marked analyzed.
4. Each claim's evidence is opened in the real file: line range must exist, the symbol must exist, and the claim's subject (or identifiers extracted from its text) must appear in the cited lines.
   - `VERIFIED` without valid evidence becomes `INFERRED` (no evidence at all) or `UNKNOWN` (cited evidence does not hold).
   - Database fields and relationships are checked against static analysis, then against the cited source text; unsupported ones are reported in `unverified` and not stored.
   - Type disagreements with source are recorded as **conflicts**; source wins.
5. Reconciliation merges into `.ai-project/`: stronger status wins, weaker AI output never replaces stronger knowledge, existing unrelated knowledge is kept, unknown stays unknown.

## 6. Errors

`ERROR.payload.code` values: `INVALID_MESSAGE`, `UNSUPPORTED_MESSAGE`, `PROTOCOL_MISMATCH`, `UNAUTHENTICATED`, `PAIRING_FAILED`, `PAIRING_REJECTED`, `TOKEN_EXPIRED`, `SESSION_MISMATCH`, `PROJECT_MISMATCH`, `ANALYSIS_UNKNOWN`, `SCHEMA_INVALID`, `RATE_LIMITED`, `INTERNAL`.

Chrome-side batch failure codes (in `AI_RESPONSE` with `status:"FAILED"`): `UI_CHANGED` (the AI website no longer matches the adapter; nothing was sent), `LOGIN`, `CAPTCHA`, `LIMIT`, `NETWORK`, `TIMEOUT`, `CONTEXT_TOO_LARGE`, `INVALID_JSON`, `NO_TAB`, `TAB_CLOSED`.

Close codes: 4000 protocol violations, 4001 authentication timeout, 4002 protocol mismatch, 4003 pairing/resume/unauthenticated failure, 4004 pairing rejected, 4005 replaced by a newer connection, 4008 rate limited, 4029 too many failed attempts.

## 7. Session recovery

- VS Code and Chrome both **checkpoint after every batch**. VS Code: `.ai-project/history/analysis-NNN.json` (`checkpoints`). Chrome: `chrome.storage.local.analyses`.
- If the socket drops, VS Code marks running analyses `DISCONNECTED` (state saved). Chrome keeps working on a batch already sent to the AI; its results are queued in an outbox and delivered after the session resumes.
- Chrome reconnects with `SESSION_RESUME`. VS Code answers with `resumable` analyses, then re-sends `ANALYSIS_REQUEST` with `resume:true` and `completedBatchIds`.
- Chrome replays completed batches VS Code does not know about, sends `ANALYSIS_ACCEPTED` (no second confirmation for an already approved analysis), and VS Code continues from the first incomplete batch. A batch that is already completed or in flight is **never processed twice**.
- After a VS Code restart, **Resume Analysis** rebuilds the batches from the recorded selection; batches whose file hashes are unchanged and were completed are skipped.

### Multiple projects
`analysisId` values are only unique within one project (each has an `analysis-001`). Chrome therefore stores them as `<projectId>~<analysisId>` and addresses every outbound message to the project the analysis belongs to; a durable message for a project other than the connected one stays in the outbox until that project's session is active again.

## 8. Versioning

`protocolVersion` is `MAJOR.MINOR`. Both sides check it on every message and at pairing. A different **major** is rejected (`PROTOCOL_MISMATCH`: "Compatible versions required"). Minor versions must only add optional fields. `schemaVersion` (`1.0`) versions the knowledge package and `.ai-project` layout separately.

## 9. Security summary

Loopback only · extension-origin only · single-use expiring pairing token · explicit user approval in VS Code · long random session key stored hashed · session/project ids enforced · schema and size limits on every message · secrets redacted before sending and re-checked in Chrome · Chrome never reads or writes project files · AI output is untrusted until VS Code verifies it against source · code changes need a hash match and explicit approval in VS Code.
