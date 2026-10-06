import { env } from "cloudflare:workers";
import { batch, now, one, stmt, uuid } from "./db";
import { Actor, ApiError, audit, permit } from "./security";
const encode = (a: Uint8Array) => btoa(String.fromCharCode(...a));
const decode = (s: string) => Uint8Array.from(atob(s), (c) => c.charCodeAt(0));
async function encryptionKey() {
  const key = env.PROVIDER_ENCRYPTION_KEY;
  if (!key || !/^[0-9a-f]{64}$/.test(key))
    throw new ApiError(
      503,
      "ENCRYPTION_NOT_CONFIGURED",
      "Provider credential encryption is not configured.",
    );
  return crypto.subtle.importKey(
    "raw",
    Uint8Array.from(key.match(/../g)!, (x) => parseInt(x, 16)),
    { name: "AES-GCM" },
    false,
    ["encrypt", "decrypt"],
  );
}
export async function readProvider(
  institutionId: string,
  provider: string,
): Promise<Record<string, string> | null> {
  const record = await one(
    "SELECT ciphertext FROM provider_configs WHERE institution_id=? AND provider=?",
    [institutionId, provider],
  );
  if (!record) return null;
  const [nonce, cipher] = record.ciphertext.split(".");
  const decrypted = await crypto.subtle.decrypt(
    {
      name: "AES-GCM",
      iv: decode(nonce),
      additionalData: new TextEncoder().encode(`${institutionId}:${provider}`),
    },
    await encryptionKey(),
    decode(cipher),
  );
  return JSON.parse(new TextDecoder().decode(decrypted));
}
export async function saveProvider(
  actor: Actor,
  provider: string,
  config: Record<string, string>,
  mode: string,
) {
  permit(actor, "admin");
  if (
    !config ||
    typeof config !== "object" ||
    Array.isArray(config) ||
    Object.values(config).some(
      (v) => typeof v !== "string" || v.length > 4096,
    ) ||
    JSON.stringify(config).length > 16000
  )
    throw new ApiError(
      422,
      "INVALID_CONFIG",
      "Enter valid provider configuration.",
    );
  if (!["test", "sandbox", "production"].includes(mode))
    throw new ApiError(
      422,
      "INVALID_MODE",
      "Select a valid provider environment.",
    );
  if (
    !["Razorpay", "Cashfree", "SMS", "WhatsApp", "Email"].includes(provider) &&
    !/^RFID:[a-f0-9-]{36}$/.test(provider)
  )
    throw new ApiError(422, "INVALID_PROVIDER", "Select a supported provider.");
  if (
    ["Razorpay", "Cashfree"].includes(provider) &&
    (!config.keyId || !config.keySecret)
  )
    throw new ApiError(
      422,
      "KEY_REQUIRED",
      "Enter the provider key ID and secret.",
    );
  if (["SMS", "WhatsApp", "Email"].includes(provider)) {
    try {
      const url = new URL(config.url);
      if (
        url.protocol !== "https:" ||
        /^(localhost|127\.|10\.|192\.168\.|169\.254\.|172\.(1[6-9]|2\d|3[01])\.|\[)/.test(
          url.hostname,
        ) ||
        url.username ||
        url.password
      )
        throw new Error();
    } catch {
      throw new ApiError(
        422,
        "INVALID_PROVIDER_URL",
        "Enter a public HTTPS notification provider endpoint.",
      );
    }
  }
  if (provider === "WhatsApp" && config.adapter === "Meta") {
    const url = new URL(config.url);
    if (
      url.hostname !== "graph.facebook.com" ||
      !/^\/v\d+\.\d+\/\d+\/messages$/.test(url.pathname) ||
      !config.phoneNumberId ||
      !url.pathname.endsWith("/" + config.phoneNumberId + "/messages") ||
      !config.appSecret ||
      !config.verifyToken
    )
      throw new ApiError(
        422,
        "INVALID_META_CONFIG",
        "Enter the Meta messages endpoint, phone number ID, app secret and webhook verification token.",
      );
  }
  const iv = crypto.getRandomValues(new Uint8Array(12)),
    cipher = await crypto.subtle.encrypt(
      {
        name: "AES-GCM",
        iv,
        additionalData: new TextEncoder().encode(
          `${actor.institutionId}:${provider}`,
        ),
      },
      await encryptionKey(),
      new TextEncoder().encode(JSON.stringify(config)),
    ),
    ciphertext = encode(iv) + "." + encode(new Uint8Array(cipher));
  await batch([
    stmt(
      "INSERT INTO provider_configs(id,institution_id,provider,ciphertext,mode,created_at,updated_at,created_by,updated_by) VALUES (?,?,?,?,?,?,?,?,?) ON CONFLICT(institution_id,provider) DO UPDATE SET ciphertext=excluded.ciphertext,mode=excluded.mode,updated_at=excluded.updated_at,updated_by=excluded.updated_by",
      [
        uuid(),
        actor.institutionId,
        provider,
        ciphertext,
        mode,
        now(),
        now(),
        actor.userId,
        actor.userId,
      ],
    ),
    audit(
      actor,
      "Updated provider credentials",
      "provider_configs",
      provider,
      null,
      { provider, mode, configured: true },
    ),
  ]);
  return { provider, configured: true };
}
export async function providerStatus(institutionId: string) {
  return await import("./db").then((m) =>
    m.all(
      "SELECT provider,mode,updated_at FROM provider_configs WHERE institution_id=?",
      [institutionId],
    ),
  );
}
