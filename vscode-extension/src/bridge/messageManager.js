// Builds outbound envelopes and tracks duplicates of inbound ones (Chrome may retry after a lost ack).
const { createMessage, MessageType } = require('./bridgeProtocol');

class MessageManager {
  constructor({ maxSeen = 2000 } = {}) {
    this.seen = new Map(); // messageId -> cached replies (array of serialized messages)
    this.maxSeen = maxSeen;
  }

  build(type, ctx) { return createMessage(type, ctx); }

  error(code, message, ctx = {}) {
    return createMessage(MessageType.ERROR, { ...ctx, payload: { code, message, ...(ctx.details ? { details: ctx.details } : {}) } });
  }

  warning(code, message, ctx = {}) {
    return createMessage(MessageType.WARNING, { ...ctx, payload: { code, message } });
  }

  isDuplicate(messageId) { return this.seen.has(messageId); }
  cachedReplies(messageId) { return this.seen.get(messageId) || []; }

  remember(messageId, replies = []) {
    this.seen.set(messageId, replies);
    if (this.seen.size > this.maxSeen) this.seen.delete(this.seen.keys().next().value);
  }

  addReply(messageId, serialized) {
    const list = this.seen.get(messageId);
    if (list) list.push(serialized);
  }
}

module.exports = { MessageManager };
