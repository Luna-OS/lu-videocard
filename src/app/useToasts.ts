import { useCallback, useRef, useState } from "react";

export interface Toast {
  id: number;
  text: string;
  tone?: "info" | "error";
  action?: { label: string; run: () => void };
}

/** Short messages that go away by themselves; at most three at a time. */
export function useToasts() {
  const [toasts, setToasts] = useState<Toast[]>([]);
  const next = useRef(1);
  const dismiss = useCallback((id: number) => {
    setToasts((ts) => ts.filter((t) => t.id !== id));
  }, []);
  const show = useCallback(
    (toast: Omit<Toast, "id">, ms = 4500) => {
      const id = next.current++;
      setToasts((ts) => [...ts.slice(-2), { ...toast, id }]);
      setTimeout(() => dismiss(id), ms);
    },
    [dismiss],
  );
  return { toasts, show, dismiss };
}
