import { AIAdapter } from './aiAdapter.js';

// ChatGPT (chatgpt.com, chat.openai.com). Selectors are best-effort and versioned: bump adapterVersion when they change.
export class ChatGPTAdapter extends AIAdapter {
  get id() { return 'chatgpt'; }
  get name() { return 'ChatGPT'; }
  get adapterVersion() { return '2026.10-5'; }
  get hosts() { return ['chatgpt.com', 'chat.openai.com']; }
  get selectors() {
    return {
      input: ['#prompt-textarea', 'div[contenteditable="true"][data-virtualkeyboard]', 'form textarea', 'textarea[data-id="root"]'],
      send: ['button[data-testid="send-button"]', 'button[data-testid="composer-submit-button"]', 'button#composer-submit-button', 'button[aria-label="Send prompt"]', 'button[aria-label="Send message"]', 'button[aria-label="Send"]'],
      stop: ['button[data-testid="stop-button"]', 'button[data-testid="composer-stop-button"]', 'button[aria-label="Stop streaming"]', 'button[aria-label="Stop generating"]', 'button[aria-label="Stop"]', 'button[aria-label="Stop response"]'],
      assistant: ['[data-message-author-role="assistant"]', '[data-turn="assistant"]', 'article[data-testid^="conversation-turn"] .markdown'],
      user: ['[data-message-author-role="user"]', '[data-turn="user"]'],
      model: ['button[data-testid="model-switcher-dropdown-button"]', '[data-testid="model-switcher"]'],
      error: ['[role="alert"]', '[data-testid="conversation-turn-error"]', 'div.text-token-text-error'],
      login: ['button[data-testid="login-button"]', 'a[href*="/auth/login"]'],
      captcha: ['iframe[src*="challenges.cloudflare.com"]', '#challenge-form'],
    };
  }
}
