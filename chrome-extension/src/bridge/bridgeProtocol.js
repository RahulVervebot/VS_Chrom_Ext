// Bridge protocol v1.0 (see BRIDGE-PROTOCOL.md). Must stay compatible with the VS Code side.
import { randomId } from '../utils/ids.js';

export const PROTOCOL = 'ai-project';
export const PROTOCOL_VERSION = '1.0';

export const T = Object.freeze(Object.fromEntries([
  'PAIR_REQUEST', 'PAIR_RESPONSE', 'PROJECT_REGISTER', 'PROJECT_REGISTER_RESPONSE', 'ANALYSIS_REQUEST', 'ANALYSIS_ACCEPTED', 'ANALYSIS_BATCH', 'ANALYSIS_BATCH_ACK',
  'ANALYSIS_PROGRESS', 'ANALYSIS_COMPLETE', 'AI_RESPONSE', 'AI_RESPONSE_ACK', 'KNOWLEDGE_PACKAGE', 'KNOWLEDGE_PACKAGE_ACK', 'KNOWLEDGE_MERGE_REQUEST', 'KNOWLEDGE_MERGE_RESULT',
  'DOCUMENTATION_REQUEST', 'DOCUMENTATION_RESPONSE', 'COMPARISON_REQUEST', 'COMPARISON_RESPONSE', 'BLUEPRINT_REQUEST', 'BLUEPRINT_RESPONSE', 'CHANGE_PROPOSAL',
  'CANCEL_REQUEST', 'PAUSE_REQUEST', 'RESUME_REQUEST', 'RETRY_REQUEST', 'ERROR', 'WARNING', 'PING', 'PONG', 'SESSION_RESUME', 'SESSION_RESUME_RESPONSE',
].map((t) => [t, t])));

export function createMessage(type, { sessionId = null, projectId = null, payload = {}, inReplyTo } = {}) {
  if (!T[type]) throw new Error(`Unknown message type ${type}`);
  const m = { protocol: PROTOCOL, protocolVersion: PROTOCOL_VERSION, messageId: randomId('msg'), messageType: type, sessionId, projectId, timestamp: new Date().toISOString().replace(/\.\d+Z$/, 'Z'), payload };
  if (inReplyTo) m.inReplyTo = inReplyTo;
  return m;
}

export function parseMessage(raw) {
  let m;
  try { m = JSON.parse(raw); } catch { return { ok: false, error: 'invalid JSON' }; }
  if (!m || m.protocol !== PROTOCOL) return { ok: false, error: 'unknown protocol' };
  if (String(m.protocolVersion).split('.')[0] !== PROTOCOL_VERSION.split('.')[0]) return { ok: false, error: `incompatible protocol version ${m.protocolVersion}` };
  if (!T[m.messageType] || !m.payload || typeof m.payload !== 'object') return { ok: false, error: 'invalid message' };
  return { ok: true, message: m };
}
