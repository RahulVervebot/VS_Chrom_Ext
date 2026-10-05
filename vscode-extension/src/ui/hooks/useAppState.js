import { useCallback, useEffect, useRef, useState } from 'react';
import { rpc, onEvent } from './useRpc.js';

// Re-runs `load` whenever the extension reports that project state changed.
export function useRemote(method, params, deps = []) {
  const [data, setData] = useState(null);
  const [error, setError] = useState(null);
  const [loading, setLoading] = useState(true);
  const seq = useRef(0);
  const load = useCallback(() => {
    const my = ++seq.current;
    return rpc(method, params).then((r) => { if (my === seq.current) { setData(r); setError(null); setLoading(false); } }).catch((e) => { if (my === seq.current) { setError(e); setLoading(false); } });
  }, [method, JSON.stringify(params)]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => { setLoading(true); load(); return onEvent('state-changed', load); }, [load, ...deps]);
  return { data, error, loading, reload: load };
}

export function useAppState() { return useRemote('getState', {}); }

export async function act(method, params, { onError } = {}) {
  try { return await rpc(method, params); } catch (e) { if (onError) onError(e); else throw e; return undefined; }
}
