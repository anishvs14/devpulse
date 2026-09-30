import { useEffect } from "react";
import type { ReactNode } from "react";

export function Modal({
  title,
  onClose,
  children,
  wide = false,
}: {
  title: string;
  onClose: () => void;
  children: ReactNode;
  wide?: boolean;
}) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [onClose]);

  return (
    <div
      className="fixed inset-0 z-40 flex items-start justify-center overflow-y-auto bg-black/60 p-4 pt-[8vh]"
      onMouseDown={(e) => e.target === e.currentTarget && onClose()}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-label={title}
        className={`w-full rounded-lg border border-line bg-panel shadow-2xl ${wide ? "max-w-2xl" : "max-w-lg"}`}
      >
        <header className="flex items-center justify-between border-b border-line px-5 py-3">
          <h2 className="font-semibold">{title}</h2>
          <button onClick={onClose} aria-label="Close" className="text-muted hover:text-fg">
            ✕
          </button>
        </header>
        <div className="p-5">{children}</div>
      </div>
    </div>
  );
}
