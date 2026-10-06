"use client";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Drawer,
  DrawerContent,
  DrawerDescription,
  DrawerFooter,
  DrawerHeader,
  DrawerTitle,
} from "@/components/ui/drawer";
import {
  Empty,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from "@/components/ui/empty";
import { Input } from "@/components/ui/input";
import {
  Pagination,
  PaginationContent,
  PaginationItem,
  PaginationNext,
  PaginationPrevious,
} from "@/components/ui/pagination";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { useIsMobile } from "@/hooks/use-mobile";
import { money } from "@/lib/money";
import { virtualTableOptions } from "@/lib/tabular";
import { useVirtualizer } from "@tanstack/react-virtual";
import { Download, FileText, Inbox, Loader2, Search } from "lucide-react";
import { ReactNode, useContext, useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import { AppContext, Row, useApp } from "./context";
export { Button, Input, money };
export function Picker({
  value,
  onChange,
  options,
  placeholder,
  className = "",
  disabled = false,
}: {
  value: string;
  onChange: (v: string) => void;
  options: { value: string; label: string }[];
  placeholder?: string;
  className?: string;
  disabled?: boolean;
}) {
  return (
    <Select
      value={value || "__all"}
      onValueChange={(v) => onChange(v === "__all" ? "" : v)}
      disabled={disabled}
    >
      <SelectTrigger className={"picker " + className} aria-label={placeholder}>
        <SelectValue placeholder={placeholder} />
      </SelectTrigger>
      <SelectContent position="popper">
        {options.map((o) => (
          <SelectItem key={o.value || "__all"} value={o.value || "__all"}>
            {o.label}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}
export function Status({ value }: { value: string }) {
  const good = [
      "Successful",
      "Paid",
      "Active",
      "Matched",
      "Sent",
      "Delivered",
      "Cleared",
      "Accepted",
      "Completed",
      "Processed",
    ],
    bad = ["Overdue", "Failed", "Suspended", "Rejected", "Unmatched"],
    neutral = ["Archived", "Closed", "Cancelled", "Refunded", "Inactive"];
  return (
    <Badge
      className={
        "status " +
        (good.includes(value)
          ? "good"
          : bad.includes(value)
            ? "bad"
            : neutral.includes(value)
              ? "neutral"
              : "pending")
      }
    >
      {value}
    </Badge>
  );
}
export const Initials = ({
  name,
  className = "",
}: {
  name: string;
  className?: string;
}) => (
  <span className={"initials " + className}>
    {(name || "S")
      .split(" ")
      .filter(Boolean)
      .slice(0, 2)
      .map((n) => n[0])
      .join("")
      .toUpperCase()}
  </span>
);
export function StudentCell({
  row,
  onClick,
}: {
  row: Row;
  onClick?: () => void;
}) {
  const name = row.name || row.student_name;
  return (
    <button className="student-cell" onClick={onClick}>
      <Initials name={name} />
      <span>
        <strong>{name}</strong>
        <small>{row.admission_number}</small>
      </span>
    </button>
  );
}
export function Card({
  title,
  action,
  children,
  className = "",
}: {
  title?: string;
  action?: ReactNode;
  children: ReactNode;
  className?: string;
}) {
  return (
    <section className={"panel " + className}>
      {title && (
        <div className="panel-header">
          <h2>{title}</h2>
          {action}
        </div>
      )}
      {children}
    </section>
  );
}
export function PageHead({
  title,
  description,
  actions,
  eyebrow,
}: {
  title: string;
  description?: string;
  actions?: ReactNode;
  eyebrow?: string;
}) {
  return (
    <div className="page-head">
      <div>
        {eyebrow && <p className="eyebrow">{eyebrow}</p>}
        <h1>{title}</h1>
        {description && <p>{description}</p>}
      </div>
      <div className="page-actions">{actions}</div>
    </div>
  );
}
export function Failure({
  message,
  retry,
}: {
  message: string;
  retry: () => void;
}) {
  return (
    <div className="failure">
      <p>{message}</p>
      <Button variant="outline" onClick={retry}>
        Try again
      </Button>
    </div>
  );
}
export function Loading() {
  return (
    <div className="loading-surface">
      <div className="loading-cards">
        {[0, 1, 2, 3].map((i) => (
          <Skeleton key={i} className="h-32 rounded-xl" />
        ))}
      </div>
      <Skeleton className="h-64 rounded-xl" />
      <Skeleton className="h-64 rounded-xl" />
    </div>
  );
}
export function DataTable({
  columns,
  rows,
  onRow,
  loading = false,
  emptyTitle,
  total,
  page = 1,
  size = 15,
  onPage,
  selected,
  onSelect,
  virtualized = false,
}: {
  columns: {
    key: string;
    label: string;
    render?: (row: Row) => ReactNode;
    align?: "right";
  }[];
  rows: Row[];
  onRow?: (r: Row) => void;
  loading?: boolean;
  emptyTitle?: string;
  total?: number;
  page?: number;
  size?: number;
  onPage?: (p: number) => void;
  selected?: string[];
  onSelect?: (ids: string[]) => void;
  virtualized?: boolean;
}) {
  const scroller = useRef<HTMLDivElement>(null),
    enabled = virtualized && rows.length > 30;
  const virtualizer = useVirtualizer({
    ...virtualTableOptions(rows.length),
    getScrollElement: () => scroller.current,
    enabled,
    getItemKey: (index) => rows[index]?.id || index,
  });
  const virtualRows = virtualizer.getVirtualItems();
  useEffect(() => {
    scroller.current?.scrollTo({ top: 0 });
  }, [page]);
  const visible = enabled
    ? virtualRows.map((v) => ({ row: rows[v.index], index: v.index }))
    : rows.map((row, index) => ({ row, index }));
  const context = useContext(AppContext),
    t = (key: string) =>
      context?.t(key as any) ||
      (
        {
          NoRecords: "No records yet",
          NoRecordsHelp: "Records will appear here when they are created.",
        } as Record<string, string>
      )[key] ||
      key;
  return (
    <>
      <div
        ref={scroller}
        className={
          "table-wrap " +
          (enabled
            ? "virtual-table [&_[data-slot=table-container]]:overflow-visible"
            : "")
        }
        style={enabled ? { maxHeight: 600, overflow: "auto" } : undefined}
        tabIndex={enabled ? 0 : undefined}
        aria-label={enabled ? "Scrollable records" : undefined}
      >
        <Table>
          <TableHeader className={enabled ? "sticky top-0 z-10 bg-white" : ""}>
            <TableRow>
              {columns.map((c) => (
                <TableHead
                  key={c.key}
                  className={c.align === "right" ? "text-right" : ""}
                >
                  {c.label}
                </TableHead>
              ))}
            </TableRow>
          </TableHeader>
          <TableBody>
            {enabled && virtualRows[0]?.start > 0 && (
              <TableRow aria-hidden="true">
                <TableCell
                  colSpan={columns.length}
                  style={{
                    height: virtualRows[0].start,
                    padding: 0,
                    border: 0,
                  }}
                />
              </TableRow>
            )}
            {loading
              ? Array.from({ length: 5 }, (_, i) => (
                  <TableRow key={i}>
                    {columns.map((c) => (
                      <TableCell key={c.key}>
                        <Skeleton className="h-5 w-full" />
                      </TableCell>
                    ))}
                  </TableRow>
                ))
              : visible.map(({ row: r, index: i }) => (
                  <TableRow
                    key={r.id || i}
                    data-index={i}
                    ref={enabled ? virtualizer.measureElement : undefined}
                    aria-rowindex={(page - 1) * size + i + 2}
                    onClick={onRow ? () => onRow(r) : undefined}
                    className={onRow ? "clickable-row" : ""}
                  >
                    {columns.map((c) => (
                      <TableCell
                        key={c.key}
                        className={
                          c.align === "right" ? "text-right tabular-nums" : ""
                        }
                      >
                        {c.render ? c.render(r) : (r[c.key] ?? "—")}
                      </TableCell>
                    ))}
                  </TableRow>
                ))}
            {enabled && virtualRows.length > 0 && (
              <TableRow aria-hidden="true">
                <TableCell
                  colSpan={columns.length}
                  style={{
                    height: Math.max(
                      0,
                      virtualizer.getTotalSize() -
                        virtualRows[virtualRows.length - 1].end,
                    ),
                    padding: 0,
                    border: 0,
                  }}
                />
              </TableRow>
            )}
          </TableBody>
        </Table>
      </div>
      {!loading && rows.length === 0 && (
        <Empty className="py-16">
          <EmptyHeader>
            <EmptyMedia variant="icon">
              <Inbox />
            </EmptyMedia>
            <EmptyTitle>{emptyTitle || t("NoRecords")}</EmptyTitle>
            <EmptyDescription>{t("NoRecordsHelp")}</EmptyDescription>
          </EmptyHeader>
        </Empty>
      )}
      {onPage && (
        <div className="table-footer">
          <span>
            {total
              ? `${(page - 1) * size + 1}–${Math.min(page * size, total)} of ${total} records`
              : "0 records"}
          </span>
          <Pagination>
            <PaginationContent>
              <PaginationItem>
                <PaginationPrevious
                  href="#"
                  onClick={(e) => {
                    e.preventDefault();
                    if (page > 1) onPage(page - 1);
                  }}
                  aria-disabled={page === 1}
                />
              </PaginationItem>
              <PaginationItem>
                <span className="page-number">{page}</span>
              </PaginationItem>
              <PaginationItem>
                <PaginationNext
                  href="#"
                  onClick={(e) => {
                    e.preventDefault();
                    if (page * size < (total || 0)) onPage(page + 1);
                  }}
                  aria-disabled={page * size >= (total || 0)}
                />
              </PaginationItem>
            </PaginationContent>
          </Pagination>
        </div>
      )}
    </>
  );
}
export function SearchBox({
  value,
  onChange,
  placeholder,
}: {
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
}) {
  return (
    <div className="search-box">
      <Search size={17} />
      <Input
        aria-label={placeholder || "Search records"}
        placeholder={placeholder || "Search records..."}
        value={value}
        onChange={(e) => onChange(e.target.value)}
      />
    </div>
  );
}
export function FormDialog({
  open,
  onClose,
  title,
  description,
  children,
  onSubmit,
  submitLabel = "Save",
  busy = false,
  wide = false,
  mobileDrawer = false,
  submitDisabled = false,
}: {
  open: boolean;
  onClose: () => void;
  title: string;
  description?: string;
  children: ReactNode;
  onSubmit?: (e: React.FormEvent) => void;
  submitLabel?: string;
  busy?: boolean;
  wide?: boolean;
  mobileDrawer?: boolean;
  submitDisabled?: boolean;
}) {
  const mobile = useIsMobile();
  if (mobileDrawer && mobile)
    return (
      <Drawer
        open={open}
        onOpenChange={(v) => !v && !busy && onClose()}
        dismissible={!busy}
      >
        <DrawerContent className="max-h-[92dvh]! campus-dialog-mobile">
          <DrawerHeader>
            <DrawerTitle>{title}</DrawerTitle>
            <DrawerDescription>
              {description || "Complete the details below."}
            </DrawerDescription>
          </DrawerHeader>
          {onSubmit ? (
            <form onSubmit={onSubmit} className="flex min-h-0 flex-col">
              <div className="overflow-y-auto px-5 pb-5">{children}</div>
              <DrawerFooter className="border-t bg-white pb-[max(16px,env(safe-area-inset-bottom))]">
                <Button type="submit" disabled={busy || submitDisabled}>
                  {busy && <Loader2 className="animate-spin" size={16} />}{" "}
                  {submitLabel}
                </Button>
                <Button
                  variant="outline"
                  type="button"
                  disabled={busy}
                  onClick={onClose}
                >
                  Cancel
                </Button>
              </DrawerFooter>
            </form>
          ) : (
            <div className="overflow-y-auto p-5">{children}</div>
          )}
        </DrawerContent>
      </Drawer>
    );
  return (
    <Dialog open={open} onOpenChange={(v) => !v && onClose()}>
      <DialogContent className={"campus-dialog " + (wide ? "wide-dialog" : "")}>
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
          <DialogDescription>
            {description || "Complete the details below."}
          </DialogDescription>
        </DialogHeader>
        {onSubmit ? (
          <form onSubmit={onSubmit}>
            <div className="form-body">{children}</div>
            <DialogFooter>
              <Button variant="outline" type="button" onClick={onClose}>
                Cancel
              </Button>
              <Button type="submit" disabled={busy || submitDisabled}>
                {busy && <Loader2 className="animate-spin" size={16} />}{" "}
                {submitLabel}
              </Button>
            </DialogFooter>
          </form>
        ) : (
          <div className="form-body">{children}</div>
        )}
      </DialogContent>
    </Dialog>
  );
}
export function Field({
  label,
  children,
  hint,
  error,
  required = false,
  className = "",
}: {
  label: string;
  children: ReactNode;
  hint?: string;
  error?: string;
  required?: boolean;
  className?: string;
}) {
  return (
    <label className={"form-field " + className}>
      <span>
        {label}
        {required && <b> *</b>}
      </span>
      {children}
      {hint && <small>{hint}</small>}
      {error && (
        <small className="text-red-600" role="alert">
          {error}
        </small>
      )}
    </label>
  );
}
export function ExportButton({
  report,
  label = "Export",
  studentId,
}: {
  report: string;
  label?: string;
  studentId?: string;
}) {
  const [open, setOpen] = useState(false),
    { query, institutionId, request, can } = useApp();
  if (!can("reports.export")) return null;
  return (
    <>
      <Button variant="outline" onClick={() => setOpen(true)}>
        <Download size={16} />
        {label}
      </Button>
      <FormDialog
        open={open}
        onClose={() => setOpen(false)}
        title="Export report"
        description="The export uses your selected academic year and filters."
      >
        <div className="export-options">
          {["xlsx", "csv", "pdf"].map((format) => (
            <Button
              key={format}
              variant="outline"
              onClick={async () => {
                try {
                  const path =
                    "/api/reports/" +
                    report +
                    "?" +
                    query({
                      format,
                      ...(studentId ? { student: studentId } : {}),
                    });
                  const response = await fetch(path, {
                    headers: { "X-Institution-ID": institutionId },
                  });
                  if (!response.ok) {
                    const e: any = await response.json();
                    throw new Error(e.message);
                  }
                  const blob = await response.blob(),
                    url = URL.createObjectURL(blob),
                    a = document.createElement("a");
                  a.href = url;
                  a.download = report + "." + format;
                  a.click();
                  URL.revokeObjectURL(url);
                  setOpen(false);
                } catch (e) {
                  toast.error((e as Error).message);
                }
              }}
            >
              <FileText size={20} />
              <strong>
                {format === "xlsx" ? "Excel" : format.toUpperCase()}
              </strong>
            </Button>
          ))}
        </div>
      </FormDialog>
    </>
  );
}
export async function downloadDocument(
  kind: string,
  id: string,
  institutionId: string,
  print = false,
  format = "a4",
) {
  const win = print ? window.open("", "_blank") : null;
  try {
    if (win) win.document.body.textContent = "Preparing your receipt…";
    const fetchDocument = () =>
      fetch(`/api/documents/${kind}/${id}?format=${format}`, {
        headers: { "X-Institution-ID": institutionId },
      });
    let response = await fetchDocument();
    for (let attempt = 0; response.status === 202 && attempt < 15; attempt++) {
      await new Promise((resolve) => setTimeout(resolve, 2000));
      response = await fetchDocument();
    }
    if (response.status === 202)
      throw new Error(
        "Receipt is still being prepared. Try downloading again shortly.",
      );
    if (!response.ok) {
      const e: { message: string } = await response.json();
      throw new Error(e.message);
    }
    const url = URL.createObjectURL(await response.blob());
    if (print && win) {
      win.location.href = url;
      win.addEventListener("load", () => win.print());
      setTimeout(() => URL.revokeObjectURL(url), 60000);
    } else {
      const a = document.createElement("a");
      a.href = url;
      a.download = kind + (format === "thermal" ? "-80mm" : "") + ".pdf";
      a.click();
      setTimeout(() => URL.revokeObjectURL(url), 1000);
    }
  } catch (error) {
    win?.close();
    throw error;
  }
}
