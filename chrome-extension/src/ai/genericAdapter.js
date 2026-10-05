import { AIAdapter } from './aiAdapter.js';

// Heuristic adapter for other chat websites the user explicitly allows. Lower confidence than the named adapters:
// it only runs after the user confirms the detected input box in the side panel ("Check provider").
export class GenericAIAdapter extends AIAdapter {
  get id() { return 'generic'; }
  get name() { return 'Other AI site'; }
  get adapterVersion() { return '2026.09-1'; }
  get hosts() { return [this.win.location.hostname]; }
  get selectors() {
    return {
      input: ['textarea', 'div[contenteditable="true"]', '[role="textbox"]'],
      send: ['button[type="submit"]', 'button[aria-label*="send" i]', 'button[data-testid*="send" i]', 'button[title*="send" i]'],
      stop: ['button[aria-label*="stop" i]', 'button[title*="stop" i]'],
      assistant: ['[data-role="assistant"]', '[data-message-author-role="assistant"]', '.assistant', '[class*="assistant" i]', '[class*="bot" i][class*="message" i]'],
      model: [],
      error: ['[role="alert"]'],
      login: ['a[href*="login" i]', 'a[href*="signin" i]'],
      captcha: ['iframe[src*="captcha" i]', 'iframe[src*="challenge" i]'],
    };
  }

  // The largest visible editable field is the best guess for the chat box.
  getInputBox() {
    const cands = this.selectors.input.flatMap((s) => { try { return [...this.doc.querySelectorAll(s)]; } catch { return []; } }).filter((el) => this.visible(el) && this.editable(el));
    if (!cands.length) return null;
    const area = (el) => { const r = el.getBoundingClientRect ? el.getBoundingClientRect() : { width: 0, height: 0 }; return r.width * r.height; };
    return cands.sort((a, b) => area(b) - area(a))[0];
  }

  // Describes what the heuristics found so the user can confirm before anything is sent.
  describe() {
    const box = this.getInputBox();
    return { input: box ? `${box.tagName.toLowerCase()}${box.id ? `#${box.id}` : ''}` : null, assistantMessages: this.all(this.selectors.assistant).length };
  }
}
