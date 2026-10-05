import { useEffect, useState } from 'react';
import { useRemote } from './useAppState.js';

// "Selection" vs "entire project" for the Architecture / Database / Features / Workflows / Dependencies views.
// Default: follow the selection when there is one. The choice is kept for the session of the panel.
let choice = 'auto'; // 'auto' | 'all'
const listeners = new Set();
export const setScopeChoice = (c) => { choice = c; listeners.forEach((l) => l()); };

export function useScope() {
  const [, force] = useState(0);
  useEffect(() => { const l = () => force((n) => n + 1); listeners.add(l); return () => listeners.delete(l); }, []);
  const { data } = useRemote('getScope', {});
  const hasSelection = !!(data && data.active);
  return { hasSelection, label: data ? data.label : '', files: data ? data.files : 0, scoped: hasSelection && choice !== 'all', showAll: choice === 'all', setAll: () => setScopeChoice('all'), setSelection: () => setScopeChoice('auto') };
}
