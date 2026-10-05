// Sessions outlive individual sockets so a reconnecting Chrome can resume.
const { randomId } = require('../utils/ids');

class SessionManager {
  constructor({ resumeWindowMs = 30 * 60 * 1000 } = {}) {
    this.sessions = new Map(); // sessionId -> session
    this.byConnection = new Map(); // connectionId -> sessionId
    this.resumeWindowMs = resumeWindowMs;
  }

  // Get-or-create the session for a paired connection.
  open({ connectionId, projectId, extensionId }) {
    const existingId = this.byConnection.get(connectionId);
    let s = existingId && this.sessions.get(existingId);
    if (s && Date.now() - s.lastSeen > this.resumeWindowMs) s = null;
    if (!s) {
      s = { sessionId: randomId('session'), connectionId, projectId, extensionId: extensionId || null, createdAt: new Date().toISOString(), lastSeen: Date.now(), socketId: null, provider: null, activeAnalyses: new Set(), completedMessages: new Set() };
      this.sessions.set(s.sessionId, s);
      this.byConnection.set(connectionId, s.sessionId);
    }
    s.lastSeen = Date.now();
    return s;
  }

  attach(sessionId, socketId) { const s = this.sessions.get(sessionId); if (s) { s.socketId = socketId; s.lastSeen = Date.now(); } return s; }
  detach(sessionId) { const s = this.sessions.get(sessionId); if (s) { s.socketId = null; s.lastSeen = Date.now(); } return s; }
  get(sessionId) { return this.sessions.get(sessionId) || null; }
  touch(sessionId) { const s = this.sessions.get(sessionId); if (s) s.lastSeen = Date.now(); }
  close(sessionId) { const s = this.sessions.get(sessionId); if (s) { this.byConnection.delete(s.connectionId); this.sessions.delete(sessionId); } }
  closeByConnection(connectionId) { const id = this.byConnection.get(connectionId); if (id) this.close(id); }
  list() { return [...this.sessions.values()]; }
}

module.exports = { SessionManager };
