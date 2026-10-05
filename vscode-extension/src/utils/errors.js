// Centralized error types. Messages are written for developers.
class AiProjectError extends Error {
  constructor(code, message, details) {
    super(message);
    this.name = 'AiProjectError';
    this.code = code;
    this.details = details;
  }
}

const ErrorCodes = {
  NO_WORKSPACE: 'NO_WORKSPACE',
  NOT_INITIALIZED: 'NOT_INITIALIZED',
  INVALID_MESSAGE: 'INVALID_MESSAGE',
  PAIRING_FAILED: 'PAIRING_FAILED',
  UNAUTHENTICATED: 'UNAUTHENTICATED',
  PROTOCOL_MISMATCH: 'PROTOCOL_MISMATCH',
  SCHEMA_MISMATCH: 'SCHEMA_MISMATCH',
  PROJECT_MISMATCH: 'PROJECT_MISMATCH',
  ANALYSIS_UNKNOWN: 'ANALYSIS_UNKNOWN',
  PATH_TRAVERSAL: 'PATH_TRAVERSAL',
  HASH_MISMATCH: 'HASH_MISMATCH',
  CHROME_UNAVAILABLE: 'CHROME_UNAVAILABLE',
  CONTEXT_TOO_LARGE: 'CONTEXT_TOO_LARGE',
  ANALYSIS_FAILED: 'ANALYSIS_FAILED',
  FILE_PERMISSION: 'FILE_PERMISSION',
  UNSUPPORTED_PROJECT: 'UNSUPPORTED_PROJECT',
};

function toUserMessage(err) {
  if (err instanceof AiProjectError) return `${err.message} (${err.code})`;
  return err && err.message ? err.message : String(err);
}

module.exports = { AiProjectError, ErrorCodes, toUserMessage };
