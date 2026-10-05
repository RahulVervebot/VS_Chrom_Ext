import { installContentRuntime } from './runtime.js';
import { GeminiAdapter } from '../ai/geminiAdapter.js';

installContentRuntime(new GeminiAdapter());
