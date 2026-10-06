"use client";
import { useEffect, useState } from "react";
import { Row, useApp, useResource } from "@/components/campus/context";
import {
  Button,
  Card,
  DataTable,
  Field,
  Input,
  Picker,
  money,
} from "@/components/campus/ui";
import { toast } from "sonner";
export function HardwareSettings() {
  const { request, query, refresh } = useApp(),
    r = useResource("hardware"),
    [name, setName] = useState(""),
    [device, setDevice] = useState<{
      id: string;
      secret: string;
      endpoint: string;
    } | null>(null),
    [search, setSearch] = useState(""),
    students = useResource("students?" + query({ q: search, size: "25" })),
    [student, setStudent] = useState(""),
    [uid, setUid] = useState(""),
    [installments, setInstallments] = useState<Row[]>([]),
    [installment, setInstallment] = useState(""),
    [service, setService] = useState("Transport"),
    [amount, setAmount] = useState(""),
    [busy, setBusy] = useState(false);
  useEffect(() => {
    if (student)
      request("students/" + student + "?" + query())
        .then((d) => setInstallments(d.installments))
        .catch((e) => toast.error(e.message));
  }, [student, request, query]);
  async function perform(fn: () => Promise<void>) {
    setBusy(true);
    try {
      await fn();
      refresh();
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  return (
    <div className="space-y-6">
      <Card title="RFID readers">
        <div className="flex gap-3">
          <Input
            aria-label="Device name"
            placeholder="Main gate reader"
            value={name}
            onChange={(e) => setName(e.target.value)}
          />
          <Button
            disabled={busy || name.length < 2}
            onClick={() =>
              perform(async () => {
                const d = await request("hardware/devices", {
                  method: "POST",
                  body: { name },
                });
                setDevice(d);
                setName("");
              })
            }
          >
            Register reader
          </Button>
        </div>
        {device && (
          <div className="my-4 space-y-2 rounded-lg bg-amber-50 p-4">
            <p className="font-medium">
              Save this device secret now. It is displayed once.
            </p>
            <Input readOnly aria-label="Device ID" value={device.id} />
            <Input
              readOnly
              aria-label="Device HMAC secret"
              value={device.secret}
            />
            <p className="break-all text-sm">Endpoint: {device.endpoint}</p>
          </div>
        )}
        <DataTable
          rows={r.data?.devices || []}
          columns={[
            { key: "name", label: "Reader" },
            { key: "id", label: "Device ID" },
            {
              key: "active",
              label: "Access",
              render: (d) => (
                <Button
                  disabled={busy}
                  variant="outline"
                  onClick={() =>
                    perform(async () => {
                      await request("hardware/devices/" + d.id, {
                        method: "PATCH",
                        body: { active: !d.active },
                      });
                    })
                  }
                >
                  {d.active ? "Disable" : "Enable"}
                </Button>
              ),
            },
          ]}
        />
      </Card>
      <Card title="Student cards and daily charges">
        <div className="settings-fields">
          <Field label="Search student">
            <Input value={search} onChange={(e) => setSearch(e.target.value)} />
          </Field>
          <Field label="Student">
            <Picker
              value={student}
              onChange={(v) => {
                setStudent(v);
                setInstallment("");
              }}
              options={[
                { value: "", label: "Choose student" },
                ...(students.data?.rows || []).map((s: Row) => ({
                  value: s.id,
                  label: s.name + " · " + s.admission_number,
                })),
              ]}
            />
          </Field>
          <Field label="RFID UID (hexadecimal)">
            <Input value={uid} onChange={(e) => setUid(e.target.value)} />
          </Field>
        </div>
        <Button
          className="my-4"
          disabled={busy || !student || !uid}
          variant="outline"
          onClick={() =>
            perform(async () => {
              await request("hardware/cards", {
                method: "POST",
                body: { studentId: student, uid },
              });
              setUid("");
              toast.success("RFID card assigned.");
            })
          }
        >
          Assign card
        </Button>
        <div className="settings-fields">
          <Field label="Daily service">
            <Picker
              value={service}
              onChange={setService}
              options={[
                { value: "Transport", label: "Transport" },
                { value: "Hostel", label: "Hostel" },
              ]}
            />
          </Field>
          <Field label="Charge to installment">
            <Picker
              value={installment}
              onChange={setInstallment}
              options={[
                { value: "", label: "Choose active-year installment" },
                ...installments.map((i) => ({
                  value: i.id,
                  label: i.title + " · " + i.due_date,
                })),
              ]}
            />
          </Field>
          <Field label="Daily amount (₹)">
            <Input value={amount} onChange={(e) => setAmount(e.target.value)} />
          </Field>
        </div>
        <p className="my-4 text-sm text-slate-500">
          The first IN event per student, service and day adds the approved
          amount to their fee ledger. This records a fee charge; it does not
          withdraw bank funds or deduct a prepaid wallet.
        </p>
        <Button
          disabled={busy || !installment || !amount}
          onClick={() =>
            perform(async () => {
              await request("hardware/rules", {
                method: "POST",
                body: {
                  studentId: student,
                  installmentId: installment,
                  service,
                  amount,
                  active: true,
                },
              });
              toast.success("Daily fee rule approved.");
            })
          }
        >
          Approve daily rate
        </Button>
        <DataTable
          rows={r.data?.rules || []}
          columns={[
            { key: "student_name", label: "Student" },
            { key: "service", label: "Service" },
            {
              key: "amount_paise",
              label: "Daily rate",
              render: (r) => money(r.amount_paise),
            },
            {
              key: "active",
              label: "Status",
              render: (r) => (
                <Button
                  variant="outline"
                  disabled={busy}
                  onClick={() =>
                    perform(async () => {
                      await request("hardware/rules", {
                        method: "POST",
                        body: {
                          studentId: r.student_id,
                          installmentId: r.installment_id,
                          service: r.service,
                          amount: (r.amount_paise / 100).toFixed(2),
                          active: !r.active,
                        },
                      });
                    })
                  }
                >
                  {r.active ? "Disable" : "Enable"}
                </Button>
              ),
            },
          ]}
        />
      </Card>
      <Card title="Recent attendance">
        <DataTable
          rows={r.data?.attendance || []}
          loading={r.loading}
          columns={[
            { key: "student_name", label: "Student" },
            { key: "device_name", label: "Reader" },
            { key: "punched_at", label: "Punch time" },
            { key: "direction", label: "Direction" },
            { key: "local_date", label: "India date" },
          ]}
        />
      </Card>
    </div>
  );
}
