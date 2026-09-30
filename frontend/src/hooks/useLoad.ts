import { useCallback, useEffect, useRef, useState } from "react";
import { ApiError } from "../services/api";

interface LoadState<T> {
  data: T | null;
  error: string | null;
  loading: boolean;
  reload: () => void;
  /** Replace the data locally (e.g. after a mutation returns the fresh row). */
  setData: (data: T) => void;
}

/**
 * Tiny data-fetching hook. Re-runs whenever `deps` change and ignores
 * out-of-order responses (fast filter typing can't show stale results).
 * `reload()` refetches without flashing the loading state.
 */
export function useLoad<T>(fetcher: () => Promise<T>, deps: unknown[]): LoadState<T> {
  const [data, setData] = useState<T | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [tick, setTick] = useState(0);
  const requestId = useRef(0);
  const fetcherRef = useRef(fetcher);
  fetcherRef.current = fetcher;
  const lastTick = useRef(0);

  useEffect(() => {
    const id = ++requestId.current;
    const isSilentReload = tick !== lastTick.current;
    lastTick.current = tick;
    if (!isSilentReload) setLoading(true);
    fetcherRef
      .current()
      .then((result) => {
        if (id !== requestId.current) return;
        setData(result);
        setError(null);
      })
      .catch((e: unknown) => {
        if (id !== requestId.current) return;
        setError(e instanceof ApiError ? e.message : "Something went wrong");
      })
      .finally(() => {
        if (id === requestId.current) setLoading(false);
      });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [...deps, tick]);

  const reload = useCallback(() => setTick((t) => t + 1), []);
  return { data, error, loading, reload, setData };
}

export function errorMessage(e: unknown): string {
  return e instanceof ApiError ? e.message : "Something went wrong";
}
