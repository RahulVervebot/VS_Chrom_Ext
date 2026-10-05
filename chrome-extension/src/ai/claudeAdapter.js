import { AIAdapter } from './aiAdapter.js';

// Claude (claude.ai).
export class ClaudeAdapter extends AIAdapter {
  get id() { return 'claude'; }
  get name() { return 'Claude'; }
  get adapterVersion() { return '2026.09-1'; }
  get hosts() { return ['claude.ai']; }
  get selectors() {
    return {
      input: ['div[contenteditable="true"].ProseMirror', 'div[contenteditable="true"][aria-label*="prompt" i]', 'fieldset div[contenteditable="true"]'],
      send: ['button[aria-label="Send message"]', 'button[aria-label="Send Message"]', 'fieldset button[type="submit"]'],
      stop: ['button[aria-label="Stop response"]', 'button[aria-label="Stop Response"]'],
      assistant: ['div[data-is-streaming]', '.font-claude-message', '[data-testid="assistant-message"]'],
      model: ['button[data-testid="model-selector-dropdown"]', '[data-testid="model-selector"]'],
      error: ['[role="alert"]', '[data-testid="error-banner"]', 'div[class*="error" i][role="status"]'],
      login: ['a[href*="/login"]', 'button[data-testid="login-button"]'],
      captcha: ['iframe[src*="challenges.cloudflare.com"]'],
    };
  }
}
