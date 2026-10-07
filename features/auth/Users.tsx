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
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  allRoles,
  normalizedPermissions,
  permissionLabels,
  permissions,
  roleLabel,
  staffRoles,
} from "@/lib/permissions";
import { History, KeyRound, Lock, Plus, Search, ShieldCheck, Trash2 } from "lucide-react";
import { useSearchParams } from "next/navigation";
import { useMemo, useState } from "react";
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
            initialPassword: "",
          }
        : null,
    ),
    [confirm, setConfirm] = useState<Row | null>(null),
    [resetPasswordUser, setResetPasswordUser] = useState<Row | null>(null),
    [newPassword, setNewPassword] = useState("Temp@12345"),
    [loginHistoryUser, setLoginHistoryUser] = useState<Row | null>(null),
    [loginHistory, setLoginHistory] = useState<Row[]>([]),
    [loadingHistory, setLoadingHistory] = useState(false),
    [search, setSearch] = useState(""),
    [roleFilter, setRoleFilter] = useState("ALL"),
    [statusFilter, setStatusFilter] = useState("ALL"),
    [page, setPage] = useState(1),
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

  const handleOpenLoginHistory = async (m: Row) => {
    setLoginHistoryUser(m);
    setLoadingHistory(true);
    try {
      const res = await request<{ history: Row[] }>(`users/${m.id}/login-history`);
      setLoginHistory(res.history || []);
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setLoadingHistory(false);
    }
  };

  const handleAdminResetPassword = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!resetPasswordUser) return;
    setBusy(true);
    try {
      await request(`users/${resetPasswordUser.id}/reset-password`, {
        method: "POST",
        body: { newPassword },
      });
      toast.success(`Password updated for ${resetPasswordUser.name || resetPasswordUser.email}`);
      setResetPasswordUser(null);
      setNewPassword("Temp@12345");
    } catch (err) {
      toast.error((err as Error).message);
    } finally {
      setBusy(false);
    }
  };

  const members = r.data?.members || [];
  const invitations = r.data?.invitations || [];

  const filteredMembers = useMemo(() => {
    return members.filter((m: Row) => {
      const matchSearch =
        !search ||
        m.name?.toLowerCase().includes(search.toLowerCase()) ||
        m.email?.toLowerCase().includes(search.toLowerCase()) ||
        m.mobile?.includes(search);
      const matchRole = roleFilter === "ALL" || m.role === roleFilter;
      const matchStatus =
        statusFilter === "ALL" ||
        (statusFilter === "Active" ? Boolean(m.active) : !m.active);
      return matchSearch && matchRole && matchStatus;
    });
  }, [members, search, roleFilter, statusFilter]);

  const pageSize = 10;
  const paginatedMembers = useMemo(() => {
    const start = (page - 1) * pageSize;
    return filteredMembers.slice(start, start + pageSize);
  }, [filteredMembers, page]);

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
                  initialPassword: "",
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
            <TabsTrigger value="members">Staff users ({members.length})</TabsTrigger>
            <TabsTrigger value="pending">Access grants ({invitations.length})</TabsTrigger>
          </TabsList>

          <div className="flex flex-wrap items-center justify-between gap-3 my-4">
            <div className="relative flex-1 min-w-[220px] max-w-sm">
              <Search className="absolute left-3 top-2.5 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder="Search by name, email, phone..."
                value={search}
                onChange={(e) => {
                  setSearch(e.target.value);
                  setPage(1);
                }}
                className="pl-9"
              />
            </div>
            <div className="flex items-center gap-2">
              <Picker
                value={roleFilter}
                onChange={(v) => {
                  setRoleFilter(v);
                  setPage(1);
                }}
                options={[
                  { value: "ALL", label: "All Roles" },
                  ...allRoles.map((role: string) => ({
                    value: role,
                    label: roleLabel(role),
                  })),
                ]}
              />
              <Picker
                value={statusFilter}
                onChange={(v) => {
                  setStatusFilter(v);
                  setPage(1);
                }}
                options={[
                  { value: "ALL", label: "All Statuses" },
                  { value: "Active", label: "Active" },
                  { value: "Disabled", label: "Disabled" },
                ]}
              />
            </div>
          </div>

          {r.error ? (
            <Failure message={r.error} retry={r.retry} />
          ) : (
            <>
              <TabsContent value="members">
                <DataTable
                  loading={r.loading}
                  rows={paginatedMembers}
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
                              onClick={() => setResetPasswordUser(m)}
                            >
                              <KeyRound size={14} className="mr-1" />
                              Reset Pwd
                            </Button>
                            <Button
                              size="sm"
                              variant="ghost"
                              onClick={() => handleOpenLoginHistory(m)}
                            >
                              <History size={14} className="mr-1" />
                              History
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
                            <Button
                              size="sm"
                              variant="ghost"
                              className="text-red-600 hover:text-red-700"
                              onClick={() =>
                                setConfirm({ ...m, action: "delete" })
                              }
                            >
                              <Trash2 size={14} />
                            </Button>
                          </div>
                        ) : null,
                    },
                  ]}
                />
                {filteredMembers.length > pageSize && (
                  <div className="flex items-center justify-between mt-4 px-2 text-sm text-muted-foreground">
                    <div>
                      Showing {(page - 1) * pageSize + 1} to{" "}
                      {Math.min(page * pageSize, filteredMembers.length)} of{" "}
                      {filteredMembers.length} users
                    </div>
                    <div className="flex items-center gap-2">
                      <Button
                        size="sm"
                        variant="outline"
                        disabled={page === 1}
                        onClick={() => setPage((p) => p - 1)}
                      >
                        Previous
                      </Button>
                      <span>Page {page}</span>
                      <Button
                        size="sm"
                        variant="outline"
                        disabled={page * pageSize >= filteredMembers.length}
                        onClick={() => setPage((p) => p + 1)}
                      >
                        Next
                      </Button>
                    </div>
                  </div>
                )}
              </TabsContent>
              <TabsContent value="pending">
                <DataTable
                  loading={r.loading}
                  rows={invitations}
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

      {/* CREATE / EDIT USER DIALOG */}
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
            const body: Record<string, any> = {
              ...d,
              sectionId: d?.sectionId || undefined,
            };
            if (!d?.id && body.initialPassword) {
              await request("users", {
                method: "POST",
                body: {
                  email: body.email,
                  fullName: body.fullName,
                  mobile: body.mobile,
                  role: body.role,
                  permissions: body.permissions,
                  password: body.initialPassword,
                  sectionId: body.sectionId,
                },
              });
            } else {
              await request(d!.id ? "users/" + d!.id : "users/invite", {
                method: d!.id ? "PATCH" : "POST",
                body,
              });
            }
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
              {!d.id && (
                <Field label="Initial Password (Optional)">
                  <Input
                    type="password"
                    placeholder="Auto-generated if left blank"
                    value={d.initialPassword || ""}
                    onChange={(e) => set("initialPassword", e.target.value)}
                  />
                </Field>
              )}
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

      {/* CONFIRM ACTION (ENABLE / DISABLE / REVOKE / RESET / DELETE) */}
      <FormDialog
        open={!!confirm}
        onClose={() => setConfirm(null)}
        title={
          confirm?.action === "reset"
            ? "Reset Staff Access"
            : confirm?.action === "delete"
              ? "Delete Staff User"
              : "Change Staff Access"
        }
        busy={busy}
        onSubmit={async (e) => {
          e.preventDefault();
          setBusy(true);
          try {
            if (confirm!.action === "reset") {
              await request("users/" + confirm!.id + "/reset-access", {
                method: "POST",
                body: {},
              });
            } else if (confirm!.action === "delete") {
              await request("users/" + confirm!.id, {
                method: "DELETE",
              });
            } else if (confirm!.action === "revoke") {
              await request("invitations/" + confirm!.id, {
                method: "PATCH",
                body: {},
              });
            } else {
              await request("users/" + confirm!.id, {
                method: "PATCH",
                body: { active: confirm!.action === "enable" },
              });
            }
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
            : confirm?.action === "delete"
              ? `Are you sure you want to completely remove ${confirm?.name || confirm?.email} from this institution?`
              : `Confirm ${confirm?.action} access for ${confirm?.name || confirm?.email}.`}
        </p>
      </FormDialog>

      {/* ADMIN RESET PASSWORD MODAL */}
      <FormDialog
        open={!!resetPasswordUser}
        onClose={() => setResetPasswordUser(null)}
        title={`Reset Password · ${resetPasswordUser?.name || resetPasswordUser?.email}`}
        description="Set a new password directly for this user."
        busy={busy}
        onSubmit={handleAdminResetPassword}
      >
        <Field label="New Password" required hint="Minimum 6 characters">
          <Input
            required
            type="password"
            value={newPassword}
            onChange={(e) => setNewPassword(e.target.value)}
          />
        </Field>
      </FormDialog>

      {/* LOGIN HISTORY MODAL */}
      <FormDialog
        open={!!loginHistoryUser}
        onClose={() => setLoginHistoryUser(null)}
        title={`Login History · ${loginHistoryUser?.name || loginHistoryUser?.email}`}
        description="Audit trail of recent successful and failed sign-in attempts."
        wide
      >
        {loadingHistory ? (
          <div className="py-8 text-center text-muted-foreground text-sm">
            Loading login history...
          </div>
        ) : loginHistory.length === 0 ? (
          <div className="py-6 text-center text-muted-foreground text-sm">
            No login records found for this account.
          </div>
        ) : (
          <div className="space-y-2 max-h-96 overflow-y-auto">
            {loginHistory.map((h: Row) => (
              <div
                key={h.id}
                className="flex items-center justify-between p-3 rounded border bg-card text-sm"
              >
                <div>
                  <div className="flex items-center gap-2">
                    <Status
                      value={h.status === "SUCCESS" ? "Active" : "Disabled"}
                    />
                    <strong className="text-xs">
                      {h.status === "SUCCESS" ? "Signed in" : "Failed attempt"}
                    </strong>
                    {h.failure_reason && (
                      <span className="text-xs text-red-500">({h.failure_reason})</span>
                    )}
                  </div>
                  <div className="text-xs text-muted-foreground mt-1">
                    IP: {h.ip_address || "127.0.0.1"} · {h.user_agent ? h.user_agent.slice(0, 40) + "..." : "Standard Browser"}
                  </div>
                </div>
                <div className="text-xs text-muted-foreground font-mono">
                  {h.created_at ? h.created_at.replace("T", " ").slice(0, 19) : "—"}
                </div>
              </div>
            ))}
          </div>
        )}
      </FormDialog>
    </>
  );
}
