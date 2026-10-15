import { useCallback, useRef, useState } from "react";

const LIMIT = 50;
const TYPE_GROUP_MS = 500;

/** One undo stack shared by typed edits (grouped) and hand actions (immediate). */
export function useHistory(initial: string) {
  const [code, setCode] = useState(initial);
  const stack = useRef<string[]>([initial]);
  const idx = useRef(0);
  const codeRef = useRef(initial);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const commit = useCallback((v: string) => {
    if (stack.current[idx.current] === v) return;
    stack.current = stack.current.slice(0, idx.current + 1).concat(v).slice(-LIMIT);
    idx.current = stack.current.length - 1;
  }, []);

  const flush = useCallback(() => {
    if (timer.current) {
      clearTimeout(timer.current);
      timer.current = null;
      commit(codeRef.current);
    }
  }, [commit]);

  const apply = (v: string) => {
    codeRef.current = v;
    setCode(v);
  };

  const setTyped = useCallback((v: string) => {
    apply(v);
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => {
      timer.current = null;
      commit(v);
    }, TYPE_GROUP_MS);
  }, [commit]);

  const setHand = useCallback((v: string) => {
    flush();
    apply(v);
    commit(v);
  }, [commit, flush]);

  const undo = useCallback(() => {
    flush();
    if (idx.current > 0) apply(stack.current[--idx.current]);
  }, [flush]);

  const redo = useCallback(() => {
    flush();
    if (idx.current < stack.current.length - 1) apply(stack.current[++idx.current]);
  }, [flush]);

  const reset = useCallback((v: string) => {
    stack.current = [v];
    idx.current = 0;
    apply(v);
  }, []);

  return { code, setTyped, setHand, undo, redo, reset, codeRef };
}
