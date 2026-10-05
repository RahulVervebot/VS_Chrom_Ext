import { AIAdapter } from './aiAdapter.js';

// Gemini (gemini.google.com).
export class GeminiAdapter extends AIAdapter {
  get id() { return 'gemini'; }
  get name() { return 'Gemini'; }
  get adapterVersion() { return '2026.09-1'; }
  get hosts() { return ['gemini.google.com']; }
  get selectors() {
    return {
      input: ['rich-textarea div.ql-editor[contenteditable="true"]', 'div.ql-editor[contenteditable="true"]', 'rich-textarea textarea'],
      send: ['button.send-button', 'button[aria-label="Send message"]', 'button[mattooltip="Send message"]'],
      stop: ['button[aria-label="Stop response"]', 'button.stop', 'button[aria-label="Stop generating"]'],
      assistant: ['model-response .markdown', 'model-response message-content', 'message-content.model-response-text', '.model-response-text'],
      model: ['bard-mode-switcher button', '[data-test-id="bard-mode-menu-button"]'],
      error: ['[role="alert"]', 'error-message', '.error-message'],
      login: ['a[href*="accounts.google.com/ServiceLogin"]', 'a[aria-label*="Sign in" i]'],
      captcha: ['iframe[src*="recaptcha"]'],
    };
  }
}
