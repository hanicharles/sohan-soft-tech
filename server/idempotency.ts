import { z } from "zod";
import { MoneyError } from "../lib/money";
import { now, one, Row, run, uuid } from "./db";
import { Actor, ApiError, sha256 } from "./security";

export function validateIdempotencyKey(value: unknown): string {
  if (
    typeof value !== "string" ||
    !/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
      value,
    )
  )
    throw new ApiError(
      400,
      "IDEMPOTENCY_KEY_REQUIRED",
      "Supply a valid UUID in the Idempotency-Key header. Reuse it when retrying the same operation.",
    );
  return value;
}
function canonical(value: any): any {
  if (Array.isArray(value)) return value.map(canonical);
  if (value && typeof value === "object")
    return Object.fromEntries(
      Object.keys(value)
        .filter((k) => k !== "idempotencyKey")
        .sort()
        .map((k) => [k, canonical(value[k])]),
    );
  return value;
}
export function requiresIdempotency(path: string[], method: string) {
  return (
    method === "POST" &&
    (["payments", "refunds", "cash", "fees", "invoices", "rollovers"].includes(
      path[0],
    ) ||
      (path[0] === "reconciliation" && path[1] === "bank-commit"))
  );
}
// Unique, durable claim serializes concurrent requests. Incomplete claims remain
// closed to automatic retries: a process crash must never create a second charge.
export async function idempotent(
  actor: Actor,
  operation: string,
  body: Row,
  next: () => Promise<Response>,
): Promise<Response> {
  const key = validateIdempotencyKey(
    actor.request.headers.get("Idempotency-Key"),
  );
  if (body.idempotencyKey && body.idempotencyKey !== key)
    throw new ApiError(
      409,
      "IDEMPOTENCY_CONFLICT",
      "Header and body idempotency keys must match.",
    );
  body.idempotencyKey = key;
  const hash = await sha256(JSON.stringify(canonical(body)));
  const existing = await one(
    "SELECT * FROM api_idempotency WHERE institution_id=? AND operation=? AND key=?",
    [actor.institutionId, operation, key],
  );
  const replay = (record: Row) => {
    if (record.request_hash !== hash)
      throw new ApiError(
        409,
        "IDEMPOTENCY_CONFLICT",
        "This key belongs to a different request. Use the original request for retries.",
      );
    if (!record.response)
      throw new ApiError(
        409,
        "REQUEST_IN_PROGRESS",
        "This operation is in progress or awaiting recovery. Check its status before retrying.",
      );
    return new Response(record.response, {
      status: record.status_code,
      headers: {
        "Content-Type": "application/json",
        "Cache-Control": "no-store",
        "Idempotency-Replayed": "true",
      },
    });
  };
  if (existing) return replay(existing);
  const id = uuid();
  try {
    await run(
      "INSERT INTO api_idempotency(id,institution_id,key,operation,request_hash,created_at) VALUES(?,?,?,?,?,?)",
      [id, actor.institutionId, key, operation, hash, now()],
    );
  } catch (error) {
    const winner = await one(
      "SELECT * FROM api_idempotency WHERE institution_id=? AND operation=? AND key=?",
      [actor.institutionId, operation, key],
    );
    if (winner) return replay(winner);
    throw error;
  }
  try {
    const response = await next(),
      text = await response.clone().text();
    await run(
      "UPDATE api_idempotency SET response=?,status_code=? WHERE id=? AND institution_id=?",
      [text, response.status, id, actor.institutionId],
    );
    return response;
  } catch (error) {
    // Validation/authorization errors precede mutation. Transient/unknown failures
    // retain the claim because the financial commit may already have succeeded.
    if (
      (error instanceof ApiError &&
        [400, 401, 403, 404, 409, 422, 503].includes(error.status)) ||
      error instanceof z.ZodError ||
      error instanceof MoneyError
    )
      await run(
        "DELETE FROM api_idempotency WHERE id=? AND institution_id=? AND response IS NULL",
        [id, actor.institutionId],
      );
    throw error;
  }
}
