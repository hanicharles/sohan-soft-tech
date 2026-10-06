import { env } from "cloudflare:workers";
import { queueReceipt } from "./communications";
import { one } from "./db";
import { Actor, ApiError, accessStudent, own } from "./security";

// Both staff and guardian downloads read generated artifacts. Financial request
// handlers never generate receipt PDFs, including the thermal-print variant.
export async function receiptDownload(actor: Actor, id: string, format = "a4") {
  if (!["a4", "thermal"].includes(format))
    throw new ApiError(422, "INVALID_FORMAT", "Choose A4 or thermal format.");
  const receipt = await own(actor, "receipts", id);
  const payment = await own(actor, "payments", receipt.payment_id);
  await accessStudent(actor, payment.student_id, payment.academic_year_id);
  const artifact = await one<{ object_key: string }>(
    "SELECT object_key FROM document_artifacts WHERE institution_id=? AND receipt_id=?",
    [actor.institutionId, id],
  );
  const key = artifact
    ? format === "thermal"
      ? artifact.object_key.replace(/\.pdf$/, "-80mm.pdf")
      : artifact.object_key
    : null;
  const object = key ? await env.BUCKET?.get(key) : null;
  if (object)
    return new Response(object.body, {
      headers: {
        "Content-Type": "application/pdf",
        "Content-Disposition": `attachment; filename="Receipt-${String(receipt.number).replace(/[^a-zA-Z0-9_-]/g, "-")}${format === "thermal" ? "-80mm" : ""}.pdf"`,
        "Cache-Control": "private,no-store",
        "X-Content-Type-Options": "nosniff",
      },
    });
  const job = await one<{ state: string }>(
    "SELECT state FROM document_jobs WHERE institution_id=? AND receipt_id=?",
    [actor.institutionId, id],
  );
  if (job?.state === "Failed" || artifact)
    throw new ApiError(
      503,
      "RECEIPT_PREPARATION_FAILED",
      "Please contact the accounts office to regenerate this receipt.",
    );
  await queueReceipt(actor, id);
  return Response.json(
    {
      success: true,
      data: {
        queued: true,
        message:
          "Your receipt is being prepared. Try the download again shortly.",
      },
    },
    {
      status: 202,
      headers: { "Retry-After": "2", "Cache-Control": "private,no-store" },
    },
  );
}
