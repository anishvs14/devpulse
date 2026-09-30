import type { ReactNode } from "react";

export const inputCls =
  "w-full rounded-md border border-line bg-ink px-3 py-2 text-sm text-fg placeholder:text-muted/70 focus:border-pulse disabled:opacity-50";
export const selectCls = inputCls;

const btnBase =
  "inline-flex items-center justify-center gap-2 rounded-md px-3.5 py-2 text-sm font-medium transition-colors disabled:cursor-not-allowed disabled:opacity-50";
export const btnPrimary = `${btnBase} bg-pulse text-ink hover:bg-pulse/85`;
export const btnGhost = `${btnBase} border border-line text-fg hover:bg-raised`;
export const btnDanger = `${btnBase} border border-sev1/50 text-sev1 hover:bg-sev1/10`;

export function Panel({
  title,
  action,
  children,
  className = "",
}: {
  title?: string;
  action?: ReactNode;
  children: ReactNode;
  className?: string;
}) {
  return (
    <section className={`rounded-lg border border-line bg-panel ${className}`}>
      {title && (
        <header className="flex items-center justify-between border-b border-line px-5 py-3">
          <h2 className="text-sm font-semibold">{title}</h2>
          {action}
        </header>
      )}
      <div className="p-5">{children}</div>
    </section>
  );
}

export function PageHeader({
  title,
  subtitle,
  action,
}: {
  title: string;
  subtitle?: string;
  action?: ReactNode;
}) {
  return (
    <div className="mb-6 flex flex-wrap items-start justify-between gap-3">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">{title}</h1>
        {subtitle && <p className="mt-1 text-sm text-muted">{subtitle}</p>}
      </div>
      {action}
    </div>
  );
}

export function Spinner({ label = "Loading…" }: { label?: string }) {
  return <p className="py-10 text-center text-sm text-muted">{label}</p>;
}

export function ErrorNote({ message, onRetry }: { message: string; onRetry?: () => void }) {
  return (
    <div
      role="alert"
      className="flex items-center justify-between gap-3 rounded-md border border-sev1/40 bg-sev1/10 px-4 py-3 text-sm text-sev1"
    >
      <span>{message}</span>
      {onRetry && (
        <button onClick={onRetry} className="underline underline-offset-2">
          Try again
        </button>
      )}
    </div>
  );
}

export function EmptyState({ title, hint }: { title: string; hint?: string }) {
  return (
    <div className="py-12 text-center">
      <p className="font-medium">{title}</p>
      {hint && <p className="mt-1 text-sm text-muted">{hint}</p>}
    </div>
  );
}

export function Field({
  label,
  children,
  hint,
}: {
  label: string;
  children: ReactNode;
  hint?: string;
}) {
  return (
    <label className="block">
      <span className="mb-1.5 block text-sm font-medium">{label}</span>
      {children}
      {hint && <span className="mt-1 block text-xs text-muted">{hint}</span>}
    </label>
  );
}
