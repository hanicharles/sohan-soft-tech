"use client";
import { useState } from "react";
import {
  Button,
  Card,
  DataTable,
  Field,
  FormDialog,
  Input,
  PageHead,
} from "@/components/campus/ui";
import { usePlatform, usePlatformResource } from "./context";
import { toast } from "sonner";
export function Organizations() {
  const { request, refresh } = usePlatform(),
    r = usePlatformResource<{
      rows: {
        id: string;
        name: string;
        administrators: string;
        institutions: number;
      }[];
      institutions: {
        id: string;
        name: string;
        organization_id: string | null;
      }[];
    }>("organizations"),
    [open, setOpen] = useState(false),
    [name, setName] = useState(""),
    [email, setEmail] = useState(""),
    [ids, setIds] = useState<string[]>([]),
    [busy, setBusy] = useState(false);
  return (
    <>
      <PageHead
        eyebrow="PLATFORM / TRUSTS"
        title="Organizations & trusts"
        description="Group independent institution tenants for consolidated, read-only financial reporting."
        actions={
          <Button onClick={() => setOpen(true)}>Create organization</Button>
        }
      />
      <Card>
        <DataTable
          rows={r.data?.rows || []}
          loading={r.loading}
          columns={[
            { key: "name", label: "Organization" },
            { key: "institutions", label: "Institutions" },
            { key: "administrators", label: "Report administrators" },
            {
              key: "actions",
              label: "Portal",
              render: (o) => (
                <a href={"/organization/" + o.id}>Open trust reports</a>
              ),
            },
          ]}
        />
        {r.error && <p role="alert">{r.error}</p>}
      </Card>
      <FormDialog
        open={open}
        onClose={() => setOpen(false)}
        title="Create organization"
        description="The named administrator receives access to this group’s reports using their local account."
        busy={busy}
        onSubmit={async (e) => {
          e.preventDefault();
          setBusy(true);
          try {
            await request("organizations", {
              method: "POST",
              body: { name, adminEmail: email, institutionIds: ids },
            });
            refresh();
            setOpen(false);
            setName("");
            setEmail("");
            setIds([]);
            toast.success("Organization and report access created.");
          } catch (e) {
            toast.error((e as Error).message);
          } finally {
            setBusy(false);
          }
        }}
      >
        <Field label="Trust / group name">
          <Input
            required
            value={name}
            onChange={(e) => setName(e.target.value)}
          />
        </Field>
        <Field label="Administrator email">
          <Input
            required
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
          />
        </Field>
        <fieldset className="space-y-2">
          <legend className="mb-2 font-medium">Institutions</legend>
          {r.data?.institutions
            .filter((i) => !i.organization_id)
            .map((i) => (
              <label key={i.id} className="flex gap-2">
                <input
                  type="checkbox"
                  checked={ids.includes(i.id)}
                  onChange={(e) =>
                    setIds(
                      e.target.checked
                        ? [...ids, i.id]
                        : ids.filter((id) => id !== i.id),
                    )
                  }
                />
                {i.name}
              </label>
            ))}
        </fieldset>
      </FormDialog>
    </>
  );
}
