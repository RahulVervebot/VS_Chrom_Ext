import { installContentRuntime } from './runtime.js';
import { ClaudeAdapter } from '../ai/claudeAdapter.js';

installContentRuntime(new ClaudeAdapter());
