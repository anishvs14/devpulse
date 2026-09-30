import { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";
import type { ReactNode } from "react";
import { authApi, setUnauthorizedHandler, tokenStore } from "../services/api";
import type { User } from "../types/api";

interface AuthState {
  user: User | null;
  token: string | null;
  /** True while we're validating a stored token on first load. */
  loading: boolean;
  login: (email: string, password: string) => Promise<void>;
  register: (email: string, fullName: string, password: string) => Promise<void>;
  logout: () => void;
}

const AuthContext = createContext<AuthState | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [token, setToken] = useState<string | null>(() => tokenStore.get());
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState<boolean>(() => tokenStore.get() !== null);

  const logout = useCallback(() => {
    tokenStore.clear();
    setToken(null);
    setUser(null);
  }, []);

  // Any 401 from any request → drop the session; ProtectedRoute redirects to /login.
  useEffect(() => {
    setUnauthorizedHandler(logout);
    return () => setUnauthorizedHandler(null);
  }, [logout]);

  // On first load, validate a stored token by fetching the current user.
  useEffect(() => {
    if (!token || user) {
      setLoading(false);
      return;
    }
    let cancelled = false;
    authApi
      .me()
      .then((u) => !cancelled && setUser(u))
      .catch(() => !cancelled && logout())
      .finally(() => !cancelled && setLoading(false));
    return () => {
      cancelled = true;
    };
  }, [token, user, logout]);

  const login = useCallback(async (email: string, password: string) => {
    const { access_token } = await authApi.login(email, password);
    tokenStore.set(access_token);
    const me = await authApi.me();
    setToken(access_token);
    setUser(me);
  }, []);

  const register = useCallback(
    async (email: string, fullName: string, password: string) => {
      await authApi.register(email, fullName, password);
      await login(email, password);
    },
    [login],
  );

  const value = useMemo(
    () => ({ user, token, loading, login, register, logout }),
    [user, token, loading, login, register, logout],
  );
  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthState {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used inside <AuthProvider>");
  return ctx;
}

export function canWrite(user: User | null): boolean {
  return user?.role === "ADMIN" || user?.role === "ENGINEER";
}
