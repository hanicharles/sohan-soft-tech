"use client";
import { Button } from "./ui";
export function DraftNotice({
  status,
  onDiscard,
}: {
  status: string;
  onDiscard: () => void;
}) {
  return (
    <div className="flex items-center justify-between gap-3 rounded-lg bg-slate-50 px-3 py-2 text-xs text-slate-500">
      <span role="status">{status}</span>
      <Button size="sm" variant="ghost" type="button" onClick={onDiscard}>
        Discard draft
      </Button>
    </div>
  );
}
