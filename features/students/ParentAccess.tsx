"use client";
import { useEffect, useState } from "react";
import { useApp } from "@/components/campus/context";
import { Button, Field, FormDialog, Input } from "@/components/campus/ui";
import { toast } from "sonner";
type Grant = {
  id: string;
  expires_at: string;
  revoked_at: string | null;
  purpose: string;
};
export function ParentAccess({ parentId }: { parentId: string }) {
  const { request } = useApp(),
    [open, setOpen] = useState(false),
    [days, setDays] = useState(7),
    [url, setUrl] = useState(""),
    [grants, setGrants] = useState<Grant[]>([]),
    [busy, setBusy] = useState(false);
  const load = () =>
    request("parent-links?parentId=" + encodeURIComponent(parentId)).then((r) =>
      setGrants(r.rows),
    );
  useEffect(() => {
    if (open) load().catch((e) => toast.error(e.message));
  }, [open, parentId]);
  return (
    <>
      <Button variant="outline" onClick={() => setOpen(true)}>
        Parent access link
      </Button>
      <FormDialog
        open={open}
        onClose={() => {
          setOpen(false);
          setUrl("");
        }}
        title="Private parent access"
        description="The link covers this guardian’s linked children in this institution. You can revoke access at any time."
        busy={busy}
        submitLabel="Generate private link"
        onSubmit={async (e) => {
          e.preventDefault();
          setBusy(true);
          try {
            const result = await request("parent-links", {
              method: "POST",
              body: { parentId, days },
            });
            setUrl(result.url);
            await load();
          } catch (e) {
            toast.error((e as Error).message);
          } finally {
            setBusy(false);
          }
        }}
      >
        <Field label="Valid for (days)">
          <Input
            type="number"
            min={1}
            max={30}
            value={days}
            onChange={(e) => setDays(Number(e.target.value))}
          />
        </Field>
        {url && (
          <div className="space-y-3 rounded-lg bg-blue-50 p-4">
            <Input
              readOnly
              aria-label="Private portal link"
              value={url}
              onFocus={(e) => e.target.select()}
            />
            <Button
              type="button"
              variant="outline"
              onClick={() =>
                navigator.clipboard
                  .writeText(url)
                  .then(() => toast.success("Private link copied."))
                  .catch(() =>
                    toast.error("Select and copy the link manually."),
                  )
              }
            >
              Copy link
            </Button>
            <a
              className="ml-3 text-blue-700"
              href={url}
              target="_blank"
              rel="noreferrer"
            >
              Open portal
            </a>
            <p className="text-sm">
              Share only with the authorized guardian. This link is shown once.
            </p>
          </div>
        )}
        <div className="space-y-3">
          {grants.map((g) => (
            <div
              key={g.id}
              className="flex items-center justify-between gap-3 border-b pb-3"
            >
              <div>
                <p className="text-sm">{g.purpose}</p>
                <p className="text-sm text-slate-500">
                  Expires {new Date(g.expires_at).toLocaleString()}
                </p>
              </div>
              <Button
                type="button"
                variant="outline"
                disabled={!!g.revoked_at || busy}
                onClick={async () => {
                  try {
                    await request("parent-links/" + g.id + "/revoke", {
                      method: "POST",
                      body: {},
                    });
                    await load();
                    toast.success("Link revoked.");
                  } catch (e) {
                    toast.error((e as Error).message);
                  }
                }}
              >
                {g.revoked_at ? "Revoked" : "Revoke"}
              </Button>
            </div>
          ))}
        </div>
      </FormDialog>
    </>
  );
}
