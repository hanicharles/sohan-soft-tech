const pendingKeys = new Map<string, string>();
export class ClientError extends Error {
  constructor(
    message: string,
    public code: string,
    public status: number,
  ) {
    super(message);
  }
}
export async function api<T = any>(
  path: string,
  options: {
    method?: string;
    body?: unknown;
    institutionId?: string;
    signal?: AbortSignal;
    idempotencyKey?: string;
  } = {},
): Promise<T> {
  const financial =
    options.method === "POST" &&
    /^(payments|refunds|cash|fees|invoices|rollovers)(\/|$)|^reconciliation\/bank-commit/.test(
      path,
    );
  const bodyKey = (options.body as any)?.idempotencyKey;
  const fingerprint = financial
    ? JSON.stringify([options.institutionId, path, options.body])
    : "";
  // Keep the key after a network/unknown error. Successful intentional repeats
  // get a fresh key; explicit form keys survive retries and double clicks.
  const key =
    options.idempotencyKey ||
    bodyKey ||
    (financial
      ? pendingKeys.get(fingerprint) || crypto.randomUUID()
      : undefined);
  if (financial && key) pendingKeys.set(fingerprint, key);
  const response = await fetch("/api/" + path, {
    method: options.method || "GET",
    headers: {
      ...(key ? { "Idempotency-Key": key } : {}),
      ...(options.body ? { "Content-Type": "application/json" } : {}),
      ...(options.institutionId
        ? { "X-Institution-ID": options.institutionId }
        : {}),
    },
    body: options.body ? JSON.stringify(options.body) : undefined,
    signal: options.signal,
    cache: "no-store",
  });
  const result: any = await response.json();
  if (!response.ok || !result.success)
    throw new ClientError(
      result.message || "This request could not be completed.",
      result.errorCode || "REQUEST_FAILED",
      response.status,
    );
  if (financial) pendingKeys.delete(fingerprint);
  return result.data;
}
