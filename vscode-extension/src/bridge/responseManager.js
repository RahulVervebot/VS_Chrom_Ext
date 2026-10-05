// Routes authenticated inbound messages to handlers by messageType and caches replies for retried messages.
const { MessageType, ErrorCode } = require('./bridgeProtocol');
const logger = require('../utils/logger');

class ResponseManager {
  constructor({ messages }) {
    this.messages = messages;
    this.handlers = new Map();
  }

  on(type, handler) { this.handlers.set(type, handler); return this; }

  // handler(message, ctx) -> Promise<Array<message>|message|void>; returned messages are sent back on the same connection.
  async dispatch(message, ctx) {
    if (this.messages.isDuplicate(message.messageId)) {
      logger.debug('BRIDGE', 'duplicate message; replaying cached replies', { type: message.messageType });
      return this.messages.cachedReplies(message.messageId).map((s) => JSON.parse(s));
    }
    this.messages.remember(message.messageId, []);
    const handler = this.handlers.get(message.messageType);
    if (!handler) return [this.messages.error(ErrorCode.UNSUPPORTED_MESSAGE, `No handler for ${message.messageType}`, { sessionId: ctx.session && ctx.session.sessionId, projectId: ctx.projectId, inReplyTo: message.messageId })];
    let out;
    try {
      out = await handler(message, ctx);
    } catch (err) {
      logger.error('BRIDGE', 'handler failed', { type: message.messageType, error: err.message });
      out = [this.messages.error(err.code && ErrorCode[err.code] ? err.code : ErrorCode.INTERNAL, err.message, { sessionId: ctx.session && ctx.session.sessionId, projectId: ctx.projectId, inReplyTo: message.messageId })];
    }
    const list = out === undefined || out === null ? [] : Array.isArray(out) ? out : [out];
    for (const m of list) if (!m.inReplyTo) m.inReplyTo = message.messageId;
    for (const m of list) this.messages.addReply(message.messageId, JSON.stringify(m));
    return list;
  }
}

module.exports = { ResponseManager };
