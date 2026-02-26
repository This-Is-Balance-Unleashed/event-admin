import { useMemo, useRef, useState } from "react";
import { useVirtualizer } from "@tanstack/react-virtual";
import { useQuery } from "@tanstack/react-query";
import { CreditCard, AlertCircle, Search, X } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { fetchAllPaystackTransactions, type PaystackTransaction } from "@/lib/paystack";

type TxStatus = PaystackTransaction["status"];

const STATUS_VARIANT: Record<TxStatus, "default" | "destructive" | "secondary" | "outline"> = {
  success: "default",
  failed: "destructive",
  abandoned: "outline",
};

const STATUS_OPTIONS: { value: TxStatus | "all"; label: string }[] = [
  { value: "all", label: "All" },
  { value: "success", label: "Success" },
  { value: "failed", label: "Failed" },
  { value: "abandoned", label: "Abandoned" },
];

function formatAmount(kobo: number) {
  return `₦${(kobo / 100).toLocaleString("en-NG")}`;
}

function formatDate(dateStr: string | null) {
  if (!dateStr) return "—";
  return new Date(dateStr).toLocaleString("en-NG", {
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

const ROW_HEIGHT = 48;
const OVERSCAN = 8;

function TableSkeleton() {
  return (
    <>
      {Array.from({ length: 12 }).map((_, i) => (
        <TableRow key={i} style={{ height: ROW_HEIGHT }}>
          {Array.from({ length: 6 }).map((_, j) => (
            <TableCell key={j}>
              <Skeleton className="h-4 w-full" />
            </TableCell>
          ))}
        </TableRow>
      ))}
    </>
  );
}

export function PaymentsPage() {
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<TxStatus | "all">("all");
  const searchRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [debouncedSearch, setDebouncedSearch] = useState("");
  const parentRef = useRef<HTMLDivElement>(null);

  const {
    data: allTransactions = [],
    isLoading,
    isError,
    error,
  } = useQuery({
    queryKey: ["paystack-all-transactions"],
    queryFn: () => fetchAllPaystackTransactions(),
    staleTime: 5 * 60_000,
  });

  const filtered = useMemo(() => {
    const q = debouncedSearch.trim().toLowerCase();
    return allTransactions.filter((tx) => {
      if (statusFilter !== "all" && tx.status !== statusFilter) return false;
      if (!q) return true;
      return (
        tx.reference.toLowerCase().includes(q) ||
        tx.customer.email.toLowerCase().includes(q) ||
        (tx.customer.first_name ?? "").toLowerCase().includes(q) ||
        (tx.customer.last_name ?? "").toLowerCase().includes(q)
      );
    });
  }, [allTransactions, debouncedSearch, statusFilter]);

  const rowVirtualizer = useVirtualizer({
    count: filtered.length,
    getScrollElement: () => parentRef.current,
    estimateSize: () => ROW_HEIGHT,
    overscan: OVERSCAN,
  });

  const virtualItems = rowVirtualizer.getVirtualItems();
  const totalSize = rowVirtualizer.getTotalSize();
  const paddingTop = virtualItems.length > 0 ? virtualItems[0].start : 0;
  const paddingBottom =
    virtualItems.length > 0 ? totalSize - virtualItems[virtualItems.length - 1].end : 0;

  const handleSearchChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const val = e.target.value;
    setSearch(val);
    if (searchRef.current) clearTimeout(searchRef.current);
    searchRef.current = setTimeout(() => setDebouncedSearch(val), 250);
  };

  const clearSearch = () => {
    setSearch("");
    setDebouncedSearch("");
  };

  return (
    <div className="flex flex-col gap-4 p-6 w-full h-[calc(100vh-64px)]">
      {/* Header */}
      <div className="flex items-center gap-3 shrink-0">
        <div className="bg-primary/10 rounded-full p-3">
          <CreditCard className="size-6 text-primary" />
        </div>
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Payments</h1>
          <p className="text-sm text-muted-foreground">
            {isLoading
              ? "Loading…"
              : `${filtered.toLocaleString ? filtered.length.toLocaleString() : filtered.length}${filtered.length !== allTransactions.length ? ` of ${allTransactions.length.toLocaleString()}` : ""} transaction${filtered.length !== 1 ? "s" : ""}`}
          </p>
        </div>
      </div>

      {/* Filters */}
      <div className="flex flex-wrap gap-2 shrink-0">
        <div className="relative flex-1 min-w-48">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 size-4 text-muted-foreground pointer-events-none" />
          <Input
            className="pl-9 pr-8 h-9"
            placeholder="Search by reference or email…"
            value={search}
            onChange={handleSearchChange}
          />
          {search && (
            <button
              onClick={clearSearch}
              className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
              aria-label="Clear search"
            >
              <X className="size-4" />
            </button>
          )}
        </div>
        <div className="flex gap-1">
          {STATUS_OPTIONS.map((opt) => (
            <Button
              key={opt.value}
              variant={statusFilter === opt.value ? "default" : "outline"}
              size="sm"
              onClick={() => setStatusFilter(opt.value)}
            >
              {opt.label}
            </Button>
          ))}
        </div>
      </div>

      {isError && (
        <div className="flex items-center gap-2 text-red-600 text-sm bg-red-50 rounded-lg p-4 border border-red-200 shrink-0">
          <AlertCircle className="size-4 shrink-0" />
          <span>
            Failed to load payments: {error instanceof Error ? error.message : "Unknown error"}
          </span>
        </div>
      )}

      {/* Virtualised table */}
      <div className="rounded-lg border overflow-hidden flex flex-col min-h-0 flex-1">
        {/* Sticky header */}
        <Table>
          <TableHeader>
            <TableRow className="bg-muted/50">
              <TableHead className="w-56">Reference</TableHead>
              <TableHead className="w-32">Amount</TableHead>
              <TableHead className="w-28">Status</TableHead>
              <TableHead>Customer</TableHead>
              <TableHead className="w-24">Channel</TableHead>
              <TableHead className="w-40">Date</TableHead>
            </TableRow>
          </TableHeader>
        </Table>

        {/* Scrollable virtual body */}
        <div ref={parentRef} className="overflow-auto flex-1">
          <Table>
            <TableBody>
              {isLoading ? (
                <TableSkeleton />
              ) : filtered.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={6} className="text-center text-muted-foreground py-12">
                    {debouncedSearch || statusFilter !== "all"
                      ? "No transactions match your filters"
                      : "No transactions found"}
                  </TableCell>
                </TableRow>
              ) : (
                <>
                  {paddingTop > 0 && (
                    <TableRow>
                      <TableCell style={{ height: paddingTop, padding: 0 }} colSpan={6} />
                    </TableRow>
                  )}
                  {virtualItems.map((vr) => {
                    const tx = filtered[vr.index];
                    return (
                      <TableRow key={tx.id} style={{ height: ROW_HEIGHT }}>
                        <TableCell className="font-mono text-xs w-56 truncate max-w-56">
                          {tx.reference}
                        </TableCell>
                        <TableCell className="w-32">{formatAmount(tx.amount)}</TableCell>
                        <TableCell className="w-28">
                          <Badge variant={STATUS_VARIANT[tx.status]} className="capitalize">
                            {tx.status}
                          </Badge>
                        </TableCell>
                        <TableCell className="text-muted-foreground">
                          <span className="block">{tx.customer.email}</span>
                          {(tx.customer.first_name || tx.customer.last_name) && (
                            <span className="text-xs">
                              {[tx.customer.first_name, tx.customer.last_name]
                                .filter(Boolean)
                                .join(" ")}
                            </span>
                          )}
                        </TableCell>
                        <TableCell className="capitalize w-24">{tx.channel}</TableCell>
                        <TableCell className="text-muted-foreground text-sm w-40">
                          {formatDate(tx.paid_at)}
                        </TableCell>
                      </TableRow>
                    );
                  })}
                  {paddingBottom > 0 && (
                    <TableRow>
                      <TableCell style={{ height: paddingBottom, padding: 0 }} colSpan={6} />
                    </TableRow>
                  )}
                </>
              )}
            </TableBody>
          </Table>
        </div>
      </div>
    </div>
  );
}
