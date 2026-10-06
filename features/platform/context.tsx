"use client";
import type { Row } from "@/components/campus/context";
import { api } from "@/lib/api-client";
import { createContext, useContext, useEffect, useState } from "react";
export const platformRequest = <T = any,>(
  path: string,
  options: { method?: string; body?: unknown; signal?: AbortSignal } = {},
) => api<T>("platform/" + path, options);
export const PlatformContext = createContext<{
  user: Row;
  revision: number;
  refresh: () => void;
} | null>(null);
export function usePlatform() {
  const value = useContext(PlatformContext);
  if (!value) throw new Error("Platform context unavailable");
  return { ...value, request: platformRequest };
}
export function usePlatformResource<T = any>(path: string) {
  const { revision } = usePlatform();
  const [data, setData] = useState<T | null>(null),
    [loading, setLoading] = useState(true),
    [error, setError] = useState<string | null>(null),
    [retry, setRetry] = useState(0);
  useEffect(() => {
    const abort = new AbortController();
    setLoading(true);
    setError(null);
    platformRequest<T>(path, { signal: abort.signal })
      .then(setData)
      .catch((e) => {
        if (e.name !== "AbortError") setError(e.message);
      })
      .finally(() => {
        if (!abort.signal.aborted) setLoading(false);
      });
    return () => abort.abort();
  }, [path, revision, retry]);
  return { data, loading, error, retry: () => setRetry((v) => v + 1) };
}
