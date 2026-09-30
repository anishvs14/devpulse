import { useState } from "react";
import type { FormEvent } from "react";
import { Link, Navigate, useLocation, useNavigate } from "react-router-dom";
import { useAuth } from "../context/AuthContext";
import { errorMessage } from "../hooks/useLoad";
import { ErrorNote, Field, btnPrimary, inputCls } from "../components/ui";

function AuthShell({ title, children, footer }: { title: string; children: React.ReactNode; footer: React.ReactNode }) {
  return (
    <div className="flex min-h-full items-center justify-center p-4">
      <div className="w-full max-w-sm">
        <div className="mb-8 text-center">
          <div className="text-3xl font-semibold tracking-tight">
            Dev<span className="text-pulse">Pulse</span>
          </div>
          <p className="mt-2 text-sm text-muted">Incident and service management</p>
        </div>
        <div className="rounded-lg border border-line bg-panel p-6">
          <h1 className="mb-5 text-lg font-semibold">{title}</h1>
          {children}
        </div>
        <p className="mt-4 text-center text-sm text-muted">{footer}</p>
      </div>
    </div>
  );
}

export function LoginPage() {
  const { user, login } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const from = (location.state as { from?: string } | null)?.from ?? "/";
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  if (user) return <Navigate to="/" replace />;

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      await login(email.trim(), password);
      navigate(from, { replace: true });
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setBusy(false);
    }
  }

  return (
    <AuthShell
      title="Sign in"
      footer={
        <>
          New here?{" "}
          <Link to="/register" className="text-pulse underline underline-offset-2">
            Create an account
          </Link>
        </>
      }
    >
      <form onSubmit={onSubmit} className="space-y-4">
        {error && <ErrorNote message={error} />}
        <Field label="Email">
          <input className={inputCls} type="email" required autoFocus autoComplete="email" value={email} onChange={(e) => setEmail(e.target.value)} />
        </Field>
        <Field label="Password">
          <input className={inputCls} type="password" required autoComplete="current-password" value={password} onChange={(e) => setPassword(e.target.value)} />
        </Field>
        <button className={`${btnPrimary} w-full`} disabled={busy}>
          {busy ? "Signing in…" : "Sign in"}
        </button>
      </form>
    </AuthShell>
  );
}

export function RegisterPage() {
  const { user, register } = useAuth();
  const navigate = useNavigate();
  const [fullName, setFullName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  if (user) return <Navigate to="/" replace />;

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      await register(email.trim(), fullName.trim(), password);
      navigate("/", { replace: true });
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setBusy(false);
    }
  }

  return (
    <AuthShell
      title="Create your account"
      footer={
        <>
          Already registered?{" "}
          <Link to="/login" className="text-pulse underline underline-offset-2">
            Sign in
          </Link>
        </>
      }
    >
      <form onSubmit={onSubmit} className="space-y-4">
        {error && <ErrorNote message={error} />}
        <Field label="Full name">
          <input className={inputCls} required autoFocus autoComplete="name" value={fullName} onChange={(e) => setFullName(e.target.value)} />
        </Field>
        <Field label="Email">
          <input className={inputCls} type="email" required autoComplete="email" value={email} onChange={(e) => setEmail(e.target.value)} />
        </Field>
        <Field label="Password" hint="8–72 characters. New accounts start as Engineer.">
          <input className={inputCls} type="password" required minLength={8} maxLength={72} autoComplete="new-password" value={password} onChange={(e) => setPassword(e.target.value)} />
        </Field>
        <button className={`${btnPrimary} w-full`} disabled={busy}>
          {busy ? "Creating account…" : "Create account"}
        </button>
      </form>
    </AuthShell>
  );
}
