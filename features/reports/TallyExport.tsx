"use client";
import { useState } from "react";
import { useApp } from "@/components/campus/context";
import { Button } from "@/components/campus/ui";
import { toast } from "sonner";
export function TallyExport() {
  const { query, institutionId, can } = useApp(),
    [busy, setBusy] = useState(false);
  if (!can("reports.export")) return null;
  return (
    <Button
      variant="outline"
      disabled={busy}
      onClick={async () => {
        setBusy(true);
        try {
          const response = await fetch(
            "/api/reports/tally?" + query({ format: "xml" }),
            {
              headers: { "X-Institution-ID": institutionId },
              cache: "no-store",
            },
          );
          if (!response.ok) {
            const error = (await response.json()) as { message: string };
            throw new Error(error.message);
          }
          const url = URL.createObjectURL(await response.blob()),
            a = document.createElement("a");
          a.href = url;
          a.download = "Sohan-Soft-Tech-Tally-Vouchers.xml";
          a.click();
          setTimeout(() => URL.revokeObjectURL(url), 1000);
        } catch (e) {
          toast.error((e as Error).message);
        } finally {
          setBusy(false);
        }
      }}
    >
      Export Tally XML
    </Button>
  );
}
