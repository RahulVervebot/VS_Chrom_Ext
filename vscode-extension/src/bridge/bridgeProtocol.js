// Bridge protocol v1.0. Transport-independent: envelope construction and validation only.
const { randomId } = require('../utils/ids');

const PROTOCOL = 'ai-project';
const PROTOCOL_VERSION = '1.0';
const MAX_MESSAGE_BYTES = 32 * 1024 * 1024;

const MessageType = Object.freeze(Object.fromEntries([
  'PAIR_REQUEST', 'PAIR_RESPONSE',
  'PROJECT_REGISTER', 'PROJECT_REGISTER_RESPONSE',
  'ANALYSIS_REQUEST', 'ANALYSIS_ACCEPTED',
  'ANALYSIS_BATCH', 'ANALYSIS_BATCH_ACK',
  'ANALYSIS_PROGRESS', 'ANALYSIS_COMPLETE',
  'AI_RESPONSE', 'AI_RESPONSE_ACK',
  'KNOWLEDGE_PACKAGE', 'KNOWLEDGE_PACKAGE_ACK',
  'KNOWLEDGE_MERGE_REQUEST', 'KNOWLEDGE_MERGE_RESULT',
  'DOCUMENTATION_REQUEST', 'DOCUMENTATION_RESPONSE',
  'COMPARISON_REQUEST', 'COMPARISON_RESPONSE',
  'BLUEPRINT_REQUEST', 'BLUEPRINT_RESPONSE',
  'CHANGE_PROPOSAL',
  'CANCEL_REQUEST', 'PAUSE_REQUEST', 'RESUME_REQUEST', 'RETRY_REQUEST',
  'ERROR', 'WARNING',
  'PING', 'PONG',
  'SESSION_RESUME', 'SESSION_RESUME_RESPONSE',
].map((t) => [t, t])));

// Messages a client may send before it is authenticated.
const PRE_AUTH = new Set([MessageType.PAIR_REQUEST, MessageType.SESSION_RESUME, MessageType.PING]);

const ErrorCode = Object.freeze({
  INVALID_MESSAGE: 'INVALID_MESSAGE',
  UNSUPPORTED_MESSAGE: 'UNSUPPORTED_MESSAGE',
  PROTOCOL_MISMATCH: 'PROTOCOL_MISMATCH',
  UNAUTHENTICATED: 'UNAUTHENTICATED',
  PAIRING_FAILED: 'PAIRING_FAILED',
  PAIRING_REJECTED: 'PAIRING_REJECTED',
  TOKEN_EXPIRED: 'TOKEN_EXPIRED',
  SESSION_MISMATCH: 'SESSION_MISMATCH',
  PROJECT_MISMATCH: 'PROJECT_MISMATCH',
  ANALYSIS_UNKNOWN: 'ANALYSIS_UNKNOWN',
  SCHEMA_INVALID: 'SCHEMA_INVALID',
  RATE_LIMITED: 'RATE_LIMITED',
  INTERNAL: 'INTERNAL',
});

const isoTs = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d+)?Z$/;

function createMessage(messageType, { sessionId = null, projectId = null, payload = {}, inReplyTo } = {}) {
  if (!MessageType[messageType]) throw new Error(`Unknown message type ${messageType}`);
  const msg = {
    protocol: PROTOCOL,
    protocolVersion: PROTOCOL_VERSION,
    messageId: randomId('msg'),
    messageType,
    sessionId,
    projectId,
    timestamp: new Date().toISOString(),
    payload,
  };
  if (inReplyTo) msg.inReplyTo = inReplyTo;
  return msg;
}

function major(v) { return String(v).split('.')[0]; }
function isCompatibleVersion(v) { return typeof v === 'string' && /^\d+\.\d+$/.test(v) && major(v) === major(PROTOCOL_VERSION); }

// Returns { ok, message?, error? }. `raw` is a string from the wire.
function parseMessage(raw) {
  if (typeof raw !== 'string' && !Buffer.isBuffer(raw)) return { ok: false, code: ErrorCode.INVALID_MESSAGE, error: 'message must be text' };
  const size = Buffer.byteLength(raw);
  if (size > MAX_MESSAGE_BYTES) return { ok: false, code: ErrorCode.INVALID_MESSAGE, error: `message exceeds ${MAX_MESSAGE_BYTES} bytes` };
  let msg;
  try { msg = JSON.parse(raw.toString()); } catch { return { ok: false, code: ErrorCode.INVALID_MESSAGE, error: 'invalid JSON' }; }
  return validateEnvelope(msg);
}

function validateEnvelope(msg) {
  if (!msg || typeof msg !== 'object' || Array.isArray(msg)) return { ok: false, code: ErrorCode.INVALID_MESSAGE, error: 'envelope must be an object' };
  if (msg.protocol !== PROTOCOL) return { ok: false, code: ErrorCode.INVALID_MESSAGE, error: 'unknown protocol' };
  if (!isCompatibleVersion(msg.protocolVersion)) return { ok: false, code: ErrorCode.PROTOCOL_MISMATCH, error: `protocol version ${msg.protocolVersion} is not compatible with ${PROTOCOL_VERSION}` };
  if (typeof msg.messageId !== 'string' || msg.messageId.length < 3 || msg.messageId.length > 100) return { ok: false, code: ErrorCode.INVALID_MESSAGE, error: 'invalid messageId' };
  if (!MessageType[msg.messageType]) return { ok: false, code: ErrorCode.UNSUPPORTED_MESSAGE, error: `unsupported messageType ${String(msg.messageType).slice(0, 40)}` };
  for (const k of ['sessionId', 'projectId']) if (msg[k] !== null && msg[k] !== undefined && (typeof msg[k] !== 'string' || msg[k].length > 100)) return { ok: false, code: ErrorCode.INVALID_MESSAGE, error: `invalid ${k}` };
  if (typeof msg.timestamp !== 'string' || !isoTs.test(msg.timestamp)) return { ok: false, code: ErrorCode.INVALID_MESSAGE, error: 'invalid timestamp' };
  if (!msg.payload || typeof msg.payload !== 'object' || Array.isArray(msg.payload)) return { ok: false, code: ErrorCode.INVALID_MESSAGE, error: 'payload must be an object' };
  return { ok: true, message: msg };
}

module.exports = { PROTOCOL, PROTOCOL_VERSION, MAX_MESSAGE_BYTES, MessageType, PRE_AUTH, ErrorCode, createMessage, parseMessage, validateEnvelope, isCompatibleVersion };
