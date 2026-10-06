import { env } from "cloudflare:workers";
import { z } from "zod";
import { batch, now, one, stmt, uuid } from "./db";
import { Actor, ApiError, audit } from "./security";
import { platformAudit } from "./tenancy";
export async function saveLogo(actor: Actor, id: string, input: unknown) {
  const d = z
    .object({
      type: z.enum(["image/png", "image/jpeg"]),
      data: z.string().max(1400000),
    })
    .parse(input);
  const institution = await one(
    "SELECT id,logo_key FROM institutions WHERE id=?",
    [id],
  );
  if (!institution)
    throw new ApiError(404, "NOT_FOUND", "Institution not found.");
  let bytes: Uint8Array;
  try {
    bytes = Uint8Array.from(atob(d.data), (c) => c.charCodeAt(0));
  } catch {
    throw new ApiError(422, "INVALID_IMAGE", "Upload a valid PNG or JPEG.");
  }
  const png =
      bytes.length > 8 &&
      [137, 80, 78, 71, 13, 10, 26, 10].every((v, i) => bytes[i] === v),
    jpeg =
      bytes.length > 3 &&
      bytes[0] === 255 &&
      bytes[1] === 216 &&
      bytes[2] === 255;
  if (bytes.length > 1048576 || !(d.type === "image/png" ? png : jpeg))
    throw new ApiError(
      422,
      "INVALID_IMAGE",
      "Upload a PNG or JPEG under 1 MB.",
    );
  if (!env.BUCKET)
    throw new ApiError(
      503,
      "UPLOAD_UNAVAILABLE",
      "Logo uploads are currently unavailable.",
    );
  const key = id + "/branding/" + uuid();
  await env.BUCKET.put(key, bytes, { httpMetadata: { contentType: d.type } });
  await batch([
    stmt(
      "UPDATE institutions SET logo_key=?,updated_at=?,updated_by=? WHERE id=?",
      [key, now(), actor.userId, id],
    ),
    actor.platform
      ? platformAudit(
          actor,
          "Updated institution logo",
          "institutions",
          id,
          { logo: !!institution.logo_key },
          { logo: true },
          id,
        )
      : audit(
          actor,
          "Updated institution logo",
          "institutions",
          id,
          { logo: !!institution.logo_key },
          { logo: true },
        ),
  ]);
  return { saved: true };
}
