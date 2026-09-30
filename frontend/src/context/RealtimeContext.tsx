import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from "react";
import type { ReactNode } from "react";
import { realtimeUrl } from "../services/api";
import { useAuth } from "./AuthContext";
import type { RealtimeEvent } from "../types/api";

export type ConnectionState = "connecting" | "open" | "closed";
type Listener = (event: RealtimeEvent) => void;

interface RealtimeState {
  connection: ConnectionState;
  subscribe: (listener: Listener) => () => void;
}

const RealtimeContext = createContext<RealtimeState | null>(null);

const MAX_BACKOFF_MS = 15_000;
const PING_INTERVAL_MS = 25_000;

/** One WebSocket for the whole app. Pages subscribe to events instead of each opening a socket. */
export function RealtimeProvider({ children }: { children: ReactNode }) {
  const { token } = useAuth();
  const [connection, setConnection] = useState<ConnectionState>("closed");
  const listeners = useRef<Set<Listener>>(new Set());

  const subscribe = useCallback((listener: Listener) => {
    listeners.current.add(listener);
    return () => {
      listeners.current.delete(listener);
    };
  }, []);

  useEffect(() => {
    if (!token) return;

    let ws: WebSocket | null = null;
    let retryTimer: ReturnType<typeof setTimeout> | undefined;
    let pingTimer: ReturnType<typeof setInterval> | undefined;
    let attempt = 0;
    let disposed = false;

    const connect = () => {
      setConnection("connecting");
      ws = new WebSocket(realtimeUrl(token));

      ws.onopen = () => {
        attempt = 0;
        setConnection("open");
        // The server loop only reads text frames; a periodic ping keeps idle proxies from dropping us.
        pingTimer = setInterval(() => ws?.readyState === WebSocket.OPEN && ws.send("ping"), PING_INTERVAL_MS);
      };

      ws.onmessage = (msg) => {
        try {
          const event = JSON.parse(msg.data as string) as RealtimeEvent;
          listeners.current.forEach((l) => l(event));
        } catch {
          /* ignore malformed frames */
        }
      };

      ws.onclose = () => {
        clearInterval(pingTimer);
        if (disposed) return;
        setConnection("closed");
        // Exponential backoff: 1s, 2s, 4s ... capped at 15s.
        const delay = Math.min(1000 * 2 ** attempt, MAX_BACKOFF_MS);
        attempt += 1;
        retryTimer = setTimeout(connect, delay);
      };
    };

    connect();
    return () => {
      disposed = true;
      clearTimeout(retryTimer);
      clearInterval(pingTimer);
      ws?.close();
      setConnection("closed");
    };
  }, [token]);

  const value = useMemo(() => ({ connection, subscribe }), [connection, subscribe]);
  return <RealtimeContext.Provider value={value}>{children}</RealtimeContext.Provider>;
}

export function useConnectionState(): ConnectionState {
  const ctx = useContext(RealtimeContext);
  if (!ctx) throw new Error("useConnectionState must be used inside <RealtimeProvider>");
  return ctx.connection;
}

/** Subscribe to live events for as long as the component is mounted. */
export function useRealtimeEvent(handler: (event: RealtimeEvent) => void): void {
  const ctx = useContext(RealtimeContext);
  if (!ctx) throw new Error("useRealtimeEvent must be used inside <RealtimeProvider>");
  const handlerRef = useRef(handler);
  useEffect(() => {
    handlerRef.current = handler;
  });
  const { subscribe } = ctx;
  useEffect(() => subscribe((e) => handlerRef.current(e)), [subscribe]);
}
