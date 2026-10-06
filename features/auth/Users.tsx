"use client";
import { Row, useApp, useResource } from "@/components/campus/context";
import {
  Button,
  Card,
  DataTable,
  Failure,
  Field,
  FormDialog,
  Input,
  PageHead,
  Picker,
  Status,
} from "@/components/campus/ui";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  normalizedPermissions,
  permissionLabels,
  permissions,
  roleLabel,
  staffRoles,
} from "@/lib/permissions";
import { Plus, ShieldCheck } from "lucide-react";
import { useSearchParams } from "next/navigation";
import { useState } from "react";
import { toast } from "sonner";
export function Users() {
  const { boot, request, refresh, can, reload } = useApp(),
    r = useResource("users"),
    params = useSearchParams(),
    [d, setD] = useState<Row | null>(() =>
      params.get("new") === "1" && can("users.manage")
        ? {
            email: "",
            fullName: "",
            mobile: "",
            role: "ACCOUNTANT",
            permissions: normalizedPermissions("ACCOUNTANT"),
            sectionId: "",
            feeVisibility: false,
          }
        : null,
    ),
    [confirm, setConfirm] = useState<Row | null>(null),
    [busy, setBusy] = useState(false),
    [error, setError] = useState("");
  const manage = can("users.manage");
  const set = (k: string, v: unknown) => setD((p) => ({ ...p, [k]: v }));
  const edit = (m: Row) => {
    setError("");
    setD({
      id: m.id,
      email: m.email,
      fullName: m.name,
      mobile: m.mobile || "",
      role: m.role,
      permissions: normalizedPermissions(
        m.role,
        JSON.parse(m.permissions || "[]"),
      ),
      sectionId: m.section_id || "",
      feeVisibility: !!m.fee_visibility,
      active: !!m.active,
    });
  };
  return (
    <>
      <PageHead
        eyebrow="INSTITUTION / USERS & ROLES"
        title="Users & Roles"
        description="Create staff access for this institution and assign only the permissions each user needs."
        actions={
          manage ? (
            <Button
              onClick={() => {
                setError("");
                setD({
                  email: "",
                  fullName: "",
                  mobile: "",
                  role: "ACCOUNTANT",
                  permissions: normalizedPermissions("ACCOUNTANT"),
                  sectionId: "",
                  feeVisibility: false,
                });
              }}
            >
              <Plus size={16} />
              Create User
            </Button>
          ) : undefined
        }
      />
      <div className="access-note">
        <ShieldCheck size={17} />
        <span>
          Staff sign in with their approved account. Pending grants
          reserve a user seat. Guardian contact records do not have login
          accounts.
        </span>
      </div>
      <Card>
        <Tabs defaultValue="members">
          <TabsList>
            <TabsTrigger value="members">Staff users</TabsTrigger>
            <TabsTrigger value="pending">Access grants</TabsTrigger>
          </TabsList>
          {r.error ? (
            <Failure message={r.error} retry={r.retry} />
          ) : (
            <>
              <TabsContent value="members">
                <DataTable
                  loading={r.loading}
                  rows={r.data?.members || []}
                  columns={[
                    {
                      key: "name",
                      label: "Name",
                      render: (m) => (
                        <div className="register-name">
                          <strong>{m.name}</strong>
                          <small>{m.email}</small>
                        </div>
                      ),
                    },
                    {
                      key: "role",
                      label: "Role",
                      render: (m) => roleLabel(m.role),
                    },
                    { key: "mobile", label: "Mobile" },
                    {
                      key: "active",
                      label: "Access",
                      render: (m) => (
                        <Status value={m.active ? "Active" : "Disabled"} />
                      ),
                    },
                    {
                      key: "actions",
                      label: "",
                      render: (m) =>
                        manage && m.user_id !== boot.user.userId ? (
                          <div className="row-actions">
                            <Button
                              size="sm"
                              variant="ghost"
                              onClick={() => edit(m)}
                            >
                              Edit
                            </Button>
                            <Button
                              size="sm"
                              variant="ghost"
                              onClick={() =>
                                setConfirm({
                                  ...m,
                                  action: m.active ? "disable" : "enable",
                                })
                              }
                            >
                              {m.active ? "Disable" : "Enable"}
                            </Button>
                            <Button
                              size="sm"
                              variant="ghost"
                              onClick={() =>
                                setConfirm({ ...m, action: "reset" })
                              }
                            >
                              Reset Access
                            </Button>
                          </div>
                        ) : null,
                    },
                  ]}
                />
              </TabsContent>
              <TabsContent value="pending">
                <DataTable
                  loading={r.loading}
                  rows={r.data?.invitations || []}
                  columns={[
                    { key: "display_name", label: "Name" },
                    { key: "email", label: "Email" },
                    {
                      key: "role",
                      label: "Role",
                      render: (m) => roleLabel(m.role),
                    },
                    {
                      key: "status",
                      label: "Status",
                      render: (m) => <Status value={m.status} />,
                    },
                    {
                      key: "actions",
                      label: "",
                      render: (m) =>
                        manage && m.status === "Pending" ? (
                          <div className="row-actions">
                            <Button
                              size="sm"
                              variant="ghost"
                              onClick={() => {
                                setError("");
                                setD({
                                  email: m.email,
                                  fullName: m.display_name,
                                  mobile: m.mobile || "",
                                  role: m.role,
                                  permissions: normalizedPermissions(
                                    m.role,
                                    JSON.parse(m.permissions || "[]"),
                                  ),
                                  sectionId: m.section_id || "",
                                  feeVisibility: !!m.fee_visibility,
                                });
                              }}
                            >
                              Edit Access
                            </Button>
                            <Button
                              size="sm"
                              variant="ghost"
                              onClick={() =>
                                setConfirm({ ...m, action: "revoke" })
                              }
                            >
                              Revoke
                            </Button>
                          </div>
                        ) : null,
                    },
                  ]}
                />
              </TabsContent>
            </>
          )}
        </Tabs>
      </Card>
      <FormDialog
        open={!!d}
        onClose={() => setD(null)}
        title={d?.id ? "Edit Staff User" : "Create Staff User"}
        description="Grant institution access to the user's account."
        wide
        busy={busy}
        onSubmit={async (e) => {
          e.preventDefault();
          setBusy(true);
          setError("");
          try {
            const body = { ...d, sectionId: d!.sectionId || undefined };
            await request(d!.id ? "users/" + d!.id : "users/invite", {
              method: d!.id ? "PATCH" : "POST",
              body,
            });
            await reload();
            refresh();
            toast.success(
              d!.id
                ? "User permissions saved."
                : "Staff access granted. Share the institution portal link.",
            );
            setD(null);
          } catch (e) {
            setError((e as Error).message);
          } finally {
            setBusy(false);
          }
        }}
      >
        {d && (
          <>
            <div className="form-grid">
              <Field label="Full name" required>
                <Input
                  required
                  value={d.fullName}
                  onChange={(e) => set("fullName", e.target.value)}
                />
              </Field>
              <Field label="Email" required>
                <Input
                  required
                  type="email"
                  readOnly={!!d.id}
                  value={d.email}
                  onChange={(e) => set("email", e.target.value)}
                />
              </Field>
              <Field label="Mobile">
                <Input
                  type="tel"
                  value={d.mobile}
                  onChange={(e) => set("mobile", e.target.value)}
                />
              </Field>
              <Field label="Role">
                <Picker
                  value={d.role}
                  onChange={(v) =>
                    setD((p) => ({
                      ...p,
                      role: v,
                      permissions: normalizedPermissions(v),
                      feeVisibility: false,
                    }))
                  }
                  options={staffRoles.map((v) => ({
                    value: v,
                    label: roleLabel(v),
                  }))}
                />
              </Field>
              {d.role === "TEACHER" && (
                <Field label="Assigned section" required>
                  <Picker
                    value={d.sectionId}
                    onChange={(v) => set("sectionId", v)}
                    options={boot.sections.map((s: Row) => ({
                      value: s.id,
                      label:
                        s.class_name +
                        " " +
                        s.name +
                        (s.stream_name ? " · " + s.stream_name : ""),
                    }))}
                  />
                </Field>
              )}
            </div>
            <Field
              label="Permissions"
              hint={
                d.role === "INSTITUTION_ADMIN"
                  ? "Institution administrators have all institution permissions."
                  : "Manage and collection permissions include the read permissions they require."
              }
            >
              <div className="permission-grid">
                {permissions.map((p) => (
                  <label key={p}>
                    <input
                      type="checkbox"
                      checked={d.permissions.includes(p)}
                      disabled={d.role === "INSTITUTION_ADMIN"}
                      onChange={(e) =>
                        set(
                          "permissions",
                          e.target.checked
                            ? [...d.permissions, p]
                            : d.permissions.filter((v: string) => v !== p),
                        )
                      }
                    />
                    {permissionLabels[p]}
                  </label>
                ))}
              </div>
            </Field>
            {error && <p className="form-error">{error}</p>}
          </>
        )}
      </FormDialog>
      <FormDialog
        open={!!confirm}
        onClose={() => setConfirm(null)}
        title={
          confirm?.action === "reset"
            ? "Reset Staff Access"
            : "Change Staff Access"
        }
        busy={busy}
        onSubmit={async (e) => {
          e.preventDefault();
          setBusy(true);
          try {
            if (confirm!.action === "reset")
              await request("users/" + confirm!.id + "/reset-access", {
                method: "POST",
                body: {},
              });
            else if (confirm!.action === "revoke")
              await request("invitations/" + confirm!.id, {
                method: "PATCH",
                body: {},
              });
            else
              await request("users/" + confirm!.id, {
                method: "PATCH",
                body: { active: confirm!.action === "enable" },
              });
            await reload();
            refresh();
            toast.success("Staff access updated.");
            setConfirm(null);
          } catch (e) {
            toast.error((e as Error).message);
          } finally {
            setBusy(false);
          }
        }}
      >
        <p>
          {confirm?.action === "reset"
            ? "Resetting access disables the current institution membership and creates a fresh account access grant."
            : `Confirm ${confirm?.action} access for ${confirm?.name || confirm?.email}.`}
        </p>
      </FormDialog>
    </>
  );
}
