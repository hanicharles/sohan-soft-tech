import { AsyncLocalStorage } from "node:async_hooks";
const context = new AsyncLocalStorage<{
  institutionId?: string;
  organizationId?: string;
  userId: string;
}>();
export function withTenantContext<T>(
  actor: { institutionId: string; userId: string; organizationId?: string },
  next: () => T,
): T {
  if (!actor.institutionId) throw new Error("Tenant context required");
  const existing = context.getStore();
  if (existing && existing.institutionId !== actor.institutionId)
    throw new Error("Tenant context cannot be switched");
  return context.run(
    {
      institutionId: actor.institutionId,
      organizationId: actor.organizationId,
      userId: actor.userId,
    },
    next,
  );
}
export function currentTenant() {
  const value = context.getStore();
  if (!value?.institutionId) throw new Error("Tenant context required");
  return { ...value, institutionId: value.institutionId };
}
// Organization reports are a separate scope, never a wildcard tenant. An
// organization context cannot use getDb() or turn into an institution context.
export function withOrganizationContext<T>(
  actor: { userId: string; organizationId: string },
  next: () => T,
): T {
  if (!actor.organizationId || context.getStore())
    throw new Error("Organization scope cannot replace an active scope");
  return context.run(
    { organizationId: actor.organizationId, userId: actor.userId },
    next,
  );
}
export function currentOrganization() {
  const active = context.getStore();
  if (!active?.organizationId || active.institutionId)
    throw new Error("Organization context required");
  return { organizationId: active.organizationId, userId: active.userId };
}
export function tenantIdFor(actor: { institutionId: string }) {
  const active = context.getStore();
  if (active && active.institutionId !== actor.institutionId)
    throw new Error("Tenant context cannot be switched");
  if (!actor.institutionId) throw new Error("Tenant context required");
  return active?.institutionId || actor.institutionId;
}
