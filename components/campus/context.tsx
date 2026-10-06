"use client";
import { useRouter } from "@/lib/browser-navigation";
import { en, Language } from "@/lib/i18n";
import { Permission } from "@/lib/permissions";
import type { ComponentProps } from "react";
import { createContext, useContext, useEffect, useState } from "react";
export type Row = Record<string, any>;
export type Scope = {
  year: string;
  campus: string;
  class: string;
  section: string;
  stream: string;
  from: string;
  to: string;
};
export type AppState = {
  boot: Row;
  scope: Scope;
  setScope: (value: Scope) => void;
  revision: number;
  refresh: () => void;
  reload: () => Promise<void>;
  request: <T = any>(
    path: string,
    options?: { method?: string; body?: unknown; signal?: AbortSignal },
  ) => Promise<T>;
  query: (extra?: Record<string, string>) => string;
  t: (key: keyof typeof en) => string;
  admin: boolean;
  collect: boolean;
  finance: boolean;
  language: Language;
  setLanguage: (v: Language) => void;
  institutionId: string;
  setInstitutionId: (v: string) => void;
  basePath: string;
  can: (permission: Permission) => boolean;
};
export const AppContext = createContext<AppState | null>(null);
export const useApp = (manage?: Permission) => {
  const value = useContext(AppContext);
  if (!value) throw new Error("Application context unavailable");
  return manage ? { ...value, admin: value.can(manage) } : value;
};
export function useCampusRouter() {
  const router = useRouter(),
    { basePath } = useApp();
  return {
    ...router,
    push: (path: string) => router.push(basePath + (path === "/" ? "" : path)),
    replace: (path: string) =>
      router.replace(basePath + (path === "/" ? "" : path)),
  };
}
export function CampusLink(props: ComponentProps<"a">) {
  const { basePath } = useApp();
  return (
    <a
      {...props}
      href={
        typeof props.href === "string" &&
        props.href.startsWith("/") &&
        !props.href.startsWith("/api/")
          ? basePath + (props.href === "/" ? "" : props.href)
          : props.href
      }
    />
  );
}
export function useResource<T = any>(path: string) {
  const { request, revision } = useApp(),
    [data, setData] = useState<T | null>(null),
    [loading, setLoading] = useState(true),
    [error, setError] = useState<string | null>(null),
    [retry, setRetry] = useState(0);
  useEffect(() => {
    const abort = new AbortController();
    setLoading(true);
    setError(null);
    request<T>(path, { signal: abort.signal })
      .then(setData)
      .catch((e) => {
        if (e.name !== "AbortError") setError(e.message);
      })
      .finally(() => {
        if (!abort.signal.aborted) setLoading(false);
      });
    return () => abort.abort();
  }, [path, revision, retry, request]);
  return { data, loading, error, retry: () => setRetry((v) => v + 1) };
}
