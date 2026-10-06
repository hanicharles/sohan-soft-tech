"use client";
import { useEffect, useRef, useState } from "react";
// Drafts are scoped to a verified user, institution, academic year and form.
// Financial records are never written here; the server remains authoritative.
export function useLocalDraft<T>({
  storageKey,
  open,
  value,
  restore,
  reset,
}: {
  storageKey: string;
  open: boolean;
  value: T;
  restore: (v: T) => void;
  reset: () => void;
}) {
  const key = "sohan:draft:v1:" + storageKey,
    [ready, setReady] = useState(false),
    [status, setStatus] = useState(""),
    latest = useRef({ key, value }),
    callbacks = useRef({ restore, reset }),
    cleared = useRef(false),
    active = useRef(false);
  latest.current = { key, value };
  callbacks.current = { restore, reset };
  const persist = (targetKey = key) => {
    if (!active.current || cleared.current || latest.current.key !== targetKey)
      return;
    try {
      localStorage.setItem(
        targetKey,
        JSON.stringify({
          version: 1,
          savedAt: Date.now(),
          value: latest.current.value,
        }),
      );
      setStatus("Draft saved on this device");
    } catch {
      setStatus("Draft storage unavailable; keep this form open");
    }
  };
  const persistRef = useRef(persist);
  persistRef.current = persist;
  useEffect(() => {
    if (!open) {
      if (active.current) persistRef.current();
      active.current = false;
      setReady(false);
      return;
    }
    active.current = true;
    cleared.current = false;
    let restored = false;
    try {
      const raw = localStorage.getItem(key);
      if (raw) {
        const draft = JSON.parse(raw);
        if (
          draft.version === 1 &&
          Date.now() - draft.savedAt < 7 * 86400000 &&
          draft.value &&
          typeof draft.value === "object" &&
          raw.length < 100000
        ) {
          callbacks.current.restore(draft.value);
          restored = true;
          setStatus("Recovered your saved draft");
        } else localStorage.removeItem(key);
      }
    } catch {
      setStatus("Draft storage unavailable");
    }
    if (!restored) {
      callbacks.current.reset();
      setStatus("Drafts are saved on this device for 7 days");
    }
    setReady(true);
    const save = () => persistRef.current(key);
    window.addEventListener("pagehide", save);
    return () => {
      save();
      window.removeEventListener("pagehide", save);
      active.current = false;
    };
  }, [open, key]);
  const serialized = JSON.stringify(value);
  useEffect(() => {
    if (!open || !ready) return;
    const timer = setTimeout(() => persistRef.current(), 350);
    return () => clearTimeout(timer);
  }, [serialized, open, ready]);
  const clear = () => {
    cleared.current = true;
    try {
      localStorage.removeItem(key);
    } catch {}
    setStatus("");
  };
  return {
    ready,
    status,
    clear,
    discard: () => {
      clear();
      callbacks.current.reset();
      cleared.current = false;
      setStatus("Draft discarded");
    },
  };
}
