import { installContentRuntime } from './runtime.js';
import { GenericAIAdapter } from '../ai/genericAdapter.js';

// Injected on demand (chrome.scripting) into a site the user explicitly granted access to.
installContentRuntime(new GenericAIAdapter());
