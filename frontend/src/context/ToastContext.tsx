import { createContext, useCallback, useContext, useMemo, useState } from "react";
import type { ReactNode } from "react";

export type ToastTone = "info" | "success" | "error" | "alert";
interface Toast {
  id: number;
  tone: ToastTone;
  message: string;
}

const ToastContext = createContext<((message: string, tone?: ToastTone) => void) | null>(null);

const TONE_CLASS: Record<ToastTone, string> = {
  info: "border-line",
  success: "border-ok/60",
  error: "border-sev1/70",
  alert: "border-sev2/70",
};

export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([]);

  const push = useCallback((message: string, tone: ToastTone = "info") => {
    const id = Date.now() + Math.random();
    setToasts((t) => [...t.slice(-3), { id, tone, message }]);
    setTimeout(() => setToasts((t) => t.filter((x) => x.id !== id)), 5000);
  }, []);

  const value = useMemo(() => push, [push]);

  return (
    <ToastContext.Provider value={value}>
      {children}
      <div
        aria-live="polite"
        className="fixed bottom-4 right-4 z-50 flex w-80 max-w-[calc(100vw-2rem)] flex-col gap-2"
      >
        {toasts.map((t) => (
          <div
            key={t.id}
            className={`rounded-md border bg-raised px-4 py-3 text-sm shadow-lg ${TONE_CLASS[t.tone]}`}
          >
            {t.message}
          </div>
        ))}
      </div>
    </ToastContext.Provider>
  );
}

export function useToast(): (message: string, tone?: ToastTone) => void {
  const ctx = useContext(ToastContext);
  if (!ctx) throw new Error("useToast must be used inside <ToastProvider>");
  return ctx;
}
