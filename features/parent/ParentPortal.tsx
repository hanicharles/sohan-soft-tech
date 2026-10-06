"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { money } from "@/lib/money";
import { Download, GraduationCap, LockKeyhole, RefreshCw } from "lucide-react";

interface CheckoutResult {
  razorpay_order_id: string;
  razorpay_payment_id: string;
  razorpay_signature: string;
}
interface CheckoutOptions {
  key: string;
  amount: number;
  currency: string;
  name: string;
  order_id: string;
  handler: (value: CheckoutResult) => void;
  modal: { ondismiss: () => void };
}
declare global {
  interface Window {
    Razorpay?: new (options: CheckoutOptions) => { open(): void };
  }
}
interface Summary {
  items: {
    id: string;
    invoice_id: string;
    name: string;
    amount_paise: number;
  }[];
  institution: { name: string; slug: string; primaryColor: string };
  children: { id: string; name: string; admission_number: string }[];
  years: { id: string; name: string; status: string }[];
  studentId: string;
  yearId: string;
  balance: {
    total_paise: number;
    paid_paise: number;
    outstanding_paise: number;
    overdue_paise: number;
    next_due_date: string;
  } | null;
  installments: {
    id: string;
    title: string;
    due_date: string;
    outstanding_paise: number;
    status: string;
  }[];
  invoices: {
    id: string;
    number: string;
    gross_paise: number;
    discount_paise: number;
    scholarship_paise: number;
    adjustment_paise: number;
    total_paise: number;
    outstanding_paise: number;
  }[];
  receipts: {
    id: string;
    number: string;
    paid_at: string;
    amount_paise: number;
    method: string;
  }[];
  receiptCount: number;
  page: number;
  donations: {
    id: string;
    financial_year: number;
    donation_reference: string;
  }[];
}
async function loadCheckout() {
  if (window.Razorpay) return;
  await new Promise<void>((resolve, reject) => {
    const script = document.createElement("script");
    script.src = "https://checkout.razorpay.com/v1/checkout.js";
    script.referrerPolicy = "no-referrer";
    script.onload = () => resolve();
    script.onerror = () =>
      reject(new Error("Payment checkout could not load. Please try again."));
    document.head.appendChild(script);
  });
}
export default function ParentPortal({ token }: { token: string }) {
  const base = "/api/parent-access/" + encodeURIComponent(token);
  const [data, setData] = useState<Summary | null>(null),
    [student, setStudent] = useState(""),
    [year, setYear] = useState(""),
    [page, setPage] = useState(1),
    [error, setError] = useState(""),
    [notice, setNotice] = useState(""),
    [busy, setBusy] = useState(false),
    [amount, setAmount] = useState(""),
    [financialYear, setFinancialYear] = useState(
      new Date().getMonth() < 3
        ? new Date().getFullYear() - 1
        : new Date().getFullYear(),
    );
  const intent = useRef<{ signature: string; key: string } | null>(null);
  const request = useCallback(
    async <T,>(path: string, body?: object, key?: string): Promise<T> => {
      const response = await fetch(base + path, {
        method: body ? "POST" : "GET",
        cache: "no-store",
        referrerPolicy: "no-referrer",
        headers: body
          ? {
              "Content-Type": "application/json",
              "Idempotency-Key": key || crypto.randomUUID(),
            }
          : {},
        body: body ? JSON.stringify(body) : undefined,
      });
      const json = (await response.json()) as { message?: string; data: T };
      if (!response.ok)
        throw new Error(json.message || "The service is unavailable.");
      return json.data as T;
    },
    [base],
  );
  const reload = useCallback(async () => {
    try {
      const result = await request<Summary>(
        "?" + new URLSearchParams({ student, year, page: String(page) }),
      );
      setData(result);
      setError("");
    } catch (e) {
      setError((e as Error).message);
    }
  }, [request, student, year, page]);
  useEffect(() => {
    void reload();
  }, [reload]);
  async function download(path: string) {
    setBusy(true);
    setNotice("");
    try {
      const response = await fetch(base + path, {
        referrerPolicy: "no-referrer",
        cache: "no-store",
      });
      if (response.status === 202) {
        setNotice(
          "Your receipt is being prepared. Download it again in a few seconds.",
        );
        return;
      }
      if (!response.ok) {
        const json = (await response.json()) as { message: string };
        throw new Error(json.message);
      }
      const url = URL.createObjectURL(await response.blob()),
        a = document.createElement("a");
      a.href = url;
      a.download =
        response.headers
          .get("content-disposition")
          ?.match(/filename="([^"]+)"/)?.[1] || "certificate.pdf";
      a.click();
      setTimeout(() => URL.revokeObjectURL(url), 1000);
    } catch (e) {
      setNotice((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  async function pay() {
    if (!data) return;
    setBusy(true);
    setNotice("");
    try {
      await loadCheckout();
      const signature = JSON.stringify({
        studentId: data.studentId,
        yearId: data.yearId,
        amount,
      });
      if (intent.current?.signature !== signature)
        intent.current = { signature, key: crypto.randomUUID() };
      const order = await request<{
        id: string;
        paymentId: string;
        keyId: string;
        amount: number;
      }>("/checkout", JSON.parse(signature), intent.current!.key);
      const Razorpay = window.Razorpay;
      if (!Razorpay) throw new Error("Checkout unavailable.");
      new Razorpay({
        key: order.keyId,
        amount: order.amount,
        currency: "INR",
        name: data.institution.name,
        order_id: order.id,
        modal: {
          ondismiss: () => {
            setBusy(false);
            setNotice(
              "Checkout closed. Refresh to check payment status before paying again.",
            );
          },
        },
        handler: async (value) => {
          try {
            await request("/verify", { ...value, paymentId: order.paymentId });
            setNotice("Payment verified. Your receipt is being prepared.");
            intent.current = null;
            await reload();
          } catch (e) {
            setNotice(
              (e as Error).message + " Refresh to check the confirmed status.",
            );
          } finally {
            setBusy(false);
          }
        },
      }).open();
    } catch (e) {
      setNotice((e as Error).message);
      setBusy(false);
    }
  }
  return (
    <main className="min-h-screen bg-slate-50 px-4 py-8 text-slate-900">
      <div className="mx-auto max-w-5xl space-y-6">
        <header className="flex items-center gap-4">
          <div
            className="rounded-2xl p-3 text-white"
            style={{
              backgroundColor: data?.institution.primaryColor || "#3157d5",
            }}
          >
            <GraduationCap size={30} />
          </div>
          <div>
            <p className="text-sm text-slate-500">
              SOHAN SOFT TECH · PARENT SELF SERVICE
            </p>
            <h1 className="text-2xl font-semibold">
              {data?.institution.name || "Your institution’s fee portal"}
            </h1>
          </div>
        </header>
        {error ? (
          <div role="alert" className="rounded-xl border bg-white p-6">
            {error}
            <Button className="ml-4" variant="outline" onClick={reload}>
              Retry
            </Button>
          </div>
        ) : !data ? (
          <p role="status">Loading your fee details…</p>
        ) : (
          <>
            <div className="flex flex-wrap gap-4 rounded-xl border bg-white p-5">
              <label className="flex-1 text-sm">
                Child
                <select
                  className="mt-2 block w-full rounded-lg border p-3"
                  value={data.studentId || ""}
                  onChange={(e) => {
                    setStudent(e.target.value);
                    setYear("");
                    setPage(1);
                    setAmount("");
                  }}
                >
                  {data.children.map((s) => (
                    <option key={s.id} value={s.id}>
                      {s.name} · {s.admission_number}
                    </option>
                  ))}
                </select>
              </label>
              <label className="flex-1 text-sm">
                Academic year
                <select
                  className="mt-2 block w-full rounded-lg border p-3"
                  value={data.yearId || ""}
                  onChange={(e) => {
                    setYear(e.target.value);
                    setPage(1);
                    setAmount("");
                  }}
                >
                  {data.years.map((y) => (
                    <option key={y.id} value={y.id}>
                      {y.name}
                    </option>
                  ))}
                </select>
              </label>
              <Button variant="outline" onClick={reload} className="self-end">
                <RefreshCw size={16} />
                Refresh
              </Button>
            </div>
            <div className="grid grid-cols-2 gap-4 md:grid-cols-4">
              {[
                ["Total fees", data.balance?.total_paise],
                ["Paid", data.balance?.paid_paise],
                ["Outstanding", data.balance?.outstanding_paise],
                ["Overdue", data.balance?.overdue_paise],
              ].map(([label, value]) => (
                <div
                  key={String(label)}
                  className="rounded-xl border bg-white p-5"
                >
                  <p className="text-sm text-slate-500">{label}</p>
                  <p className="mt-2 text-xl font-semibold">
                    {money(Number(value || 0))}
                  </p>
                </div>
              ))}
            </div>
            {notice && (
              <p
                role="status"
                className="rounded-lg bg-blue-50 p-4 text-blue-900"
              >
                {notice}
              </p>
            )}
            <section className="rounded-xl border bg-white p-6">
              <h2 className="mb-4 text-lg font-semibold">Pay school fees</h2>
              <div className="flex flex-wrap items-end gap-4">
                <label className="text-sm">
                  Amount (₹)
                  <Input
                    inputMode="decimal"
                    placeholder="Enter full or partial amount"
                    value={amount}
                    onChange={(e) => setAmount(e.target.value)}
                    className="mt-2 w-64"
                  />
                </label>
                <Button
                  disabled={busy || !amount || !data.balance?.outstanding_paise}
                  onClick={pay}
                >
                  Pay securely
                </Button>
                <a
                  className="text-sm text-blue-700 underline"
                  target="_blank"
                  rel="noreferrer"
                  href={
                    base +
                    "/upi?" +
                    new URLSearchParams({
                      student: data.studentId || "",
                      year: data.yearId || "",
                    })
                  }
                >
                  View UPI QR
                </a>
              </div>
              <p className="mt-3 text-sm text-slate-500">
                Payments appear after confirmation from the bank or payment
                provider. UPI transfers outside checkout require accounts-office
                reconciliation.
              </p>
            </section>
            <section className="rounded-xl border bg-white p-6">
              <h2 className="mb-4 text-lg font-semibold">Fee breakdown</h2>
              {data.invoices.map((i) => (
                <details key={i.id} className="border-b py-3">
                  <summary className="cursor-pointer">
                    {i.number} · Total {money(i.total_paise)} · Balance{" "}
                    {money(i.outstanding_paise)}
                  </summary>
                  <div className="mt-3 space-y-2">
                    {data.items
                      .filter((item) => item.invoice_id === i.id)
                      .map((item) => (
                        <div key={item.id} className="flex justify-between">
                          <span>{item.name}</span>
                          <span>{money(item.amount_paise)}</span>
                        </div>
                      ))}
                    {[
                      ["Discounts", -i.discount_paise],
                      ["Scholarships", -i.scholarship_paise],
                      ["Adjustments / late fees", i.adjustment_paise],
                    ]
                      .filter(([, value]) => value !== 0)
                      .map(([label, value]) => (
                        <div
                          key={String(label)}
                          className="flex justify-between text-slate-600"
                        >
                          <span>{label}</span>
                          <span>{money(Number(value))}</span>
                        </div>
                      ))}
                  </div>
                </details>
              ))}
            </section>
            <section className="rounded-xl border bg-white p-6">
              <h2 className="mb-4 text-lg font-semibold">Fee schedule</h2>
              {data.installments.length ? (
                data.installments.map((i) => (
                  <div
                    key={i.id}
                    className="flex justify-between gap-4 border-b py-3 last:border-0"
                  >
                    <div>
                      <p>{i.title}</p>
                      <p className="text-sm text-slate-500">
                        Due {i.due_date} · {i.status}
                      </p>
                    </div>
                    <strong>{money(i.outstanding_paise)}</strong>
                  </div>
                ))
              ) : (
                <p>No fee demands for this academic year.</p>
              )}
            </section>
            <section className="rounded-xl border bg-white p-6">
              <h2 className="mb-4 text-lg font-semibold">
                Historical receipts
              </h2>
              {data.receipts.map((r) => (
                <div
                  key={r.id}
                  className="flex flex-wrap items-center justify-between gap-3 border-b py-3"
                >
                  <div>
                    <p>{r.number}</p>
                    <p className="text-sm text-slate-500">
                      {r.paid_at.slice(0, 10)} · {r.method} ·{" "}
                      {money(r.amount_paise)}
                    </p>
                  </div>
                  <Button
                    variant="outline"
                    disabled={busy}
                    onClick={() => download("/receipts/" + r.id)}
                  >
                    <Download size={16} />
                    Download
                  </Button>
                </div>
              ))}
              {!data.receipts.length && (
                <p>No receipts in this academic year.</p>
              )}
              <div className="mt-4 flex items-center justify-end gap-3">
                <Button
                  variant="outline"
                  disabled={page === 1}
                  onClick={() => setPage((p) => p - 1)}
                >
                  Previous
                </Button>
                <span className="text-sm">Page {page}</span>
                <Button
                  variant="outline"
                  disabled={page * 20 >= data.receiptCount}
                  onClick={() => setPage((p) => p + 1)}
                >
                  Next
                </Button>
              </div>
            </section>
            <section className="rounded-xl border bg-white p-6">
              <h2 className="mb-4 text-lg font-semibold">
                Annual certificates
              </h2>
              <div className="flex flex-wrap items-end gap-3">
                <label className="text-sm">
                  Financial year starting April
                  <Input
                    type="number"
                    min={2000}
                    max={2100}
                    value={financialYear}
                    onChange={(e) => setFinancialYear(Number(e.target.value))}
                    className="mt-2"
                  />
                </label>
                <Button
                  variant="outline"
                  disabled={busy || !data.studentId}
                  onClick={() =>
                    download(
                      "/certificates/tuition?" +
                        new URLSearchParams({
                          student: data.studentId,
                          financialYear: String(financialYear),
                        }),
                    )
                  }
                >
                  Download tuition certificate
                </Button>
              </div>
              <p className="mt-3 text-sm text-slate-500">
                Accounts must approve tuition allocations. Donation Form 10BE
                documents appear separately after the institution supplies the
                official certificate.
              </p>
              {data.donations.map((d) => (
                <Button
                  key={d.id}
                  variant="outline"
                  className="mt-3"
                  onClick={() => download("/certificates/80g/" + d.id)}
                >
                  Form 10BE · {d.financial_year} · {d.donation_reference}
                </Button>
              ))}
            </section>
          </>
        )}
        <footer className="flex items-center gap-2 text-sm text-slate-500">
          <LockKeyhole size={16} />
          This private link gives access to your family’s fee records. Keep it
          private.
        </footer>
      </div>
    </main>
  );
}
