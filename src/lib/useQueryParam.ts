import { useCallback } from 'react';
import { useSearchParams } from 'react-router-dom';

/** Read/write a single URL query parameter (keeps deep links like ?open=SH-1042 working). */
export function useQueryParam(key: string): [string | null, (v: string | null) => void] {
  const [params, setParams] = useSearchParams();
  const set = useCallback((v: string | null) => {
    setParams((prev) => {
      const p = new URLSearchParams(prev);
      if (v === null) p.delete(key); else p.set(key, v);
      return p;
    }, { replace: true });
  }, [key, setParams]);
  return [params.get(key), set];
}
