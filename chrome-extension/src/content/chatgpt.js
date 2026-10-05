import { installContentRuntime } from './runtime.js';
import { ChatGPTAdapter } from '../ai/chatgptAdapter.js';

installContentRuntime(new ChatGPTAdapter());
