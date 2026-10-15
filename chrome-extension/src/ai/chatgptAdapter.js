import { AIAdapter } from './aiAdapter.js';

// ChatGPT (chatgpt.com, chat.openai.com). Selectors are best-effort and versioned: bump adapterVersion when they change.
export class ChatGPTAdapter extends AIAdapter {
  get id() { return 'chatgpt'; }
  get name() { return 'ChatGPT'; }
  get adapterVersion() { return '2026.10-6'; }
  get hosts() { return ['chatgpt.com', 'chat.openai.com']; }
  get selectors() {
    return {
      input: ['#prompt-textarea', 'form[data-chatgpt-composer] div.ProseMirror[contenteditable="true"]', 'div[contenteditable="true"][data-virtualkeyboard]', 'form textarea', 'textarea[data-id="root"]'],
      send: ['button[data-testid="send-button"]', 'button[data-testid="composer-submit-button"]', 'button#composer-submit-button', 'button[aria-label="Send prompt"]', 'button[aria-label="Send message"]', 'button[aria-label="Send"]'],
      stop: ['button[data-testid="stop-button"]', 'button[data-testid="composer-stop-button"]', 'button[aria-label="Stop streaming"]', 'button[aria-label="Stop generating"]', 'button[aria-label="Stop"]', 'button[aria-label="Stop response"]'],
      // 2026 layout (seen in Project chats): user bubbles are [data-user-message-bubble], answers are the assistant markdown root
      assistant: ['[data-message-author-role="assistant"]', '[data-markdown-text-style="assistant-message"]', '[data-content-search-unit-key$=":assistant"]', '[data-turn="assistant"]', 'article[data-testid^="conversation-turn"] .markdown'],
      user: ['[data-message-author-role="user"]', '[data-user-message-bubble="true"]', '[data-content-search-unit-key$=":user"]', '[data-turn="user"]'],
      model: ['button[data-testid="model-switcher-dropdown-button"]', '[data-testid="model-switcher"]'],
      error: ['[role="alert"]', '[data-testid="conversation-turn-error"]', 'div.text-token-text-error'],
      login: ['button[data-testid="login-button"]', 'a[href*="/auth/login"]'],
      captcha: ['iframe[src*="challenges.cloudflare.com"]', '#challenge-form'],
    };
  }

  // The 2026 layout marks each turn with data-talvt-turn-state ("complete" when done). A turn whose state says it is still being
  // produced counts as "reply still being generated"; any other value is not treated as streaming, so an unknown state never blocks.
  streamingIndicator() {
    const turns = this.doc.querySelectorAll('[data-talvt-turn-state]');
    const last = turns[turns.length - 1];
    if (!last) return null;
    return /stream|progress|generat|pending|running|think|writ|loading/i.test(last.getAttribute('data-talvt-turn-state') || '') ? last : null;
  }
}
