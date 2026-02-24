import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { CreditCard, ChevronLeft, ChevronRight, AlertCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { fetchPaystackTransactions, type PaystackTransaction } from "@/lib/paystack";

const PER_PAGE = 50;

type TxStatus = PaystackTransaction["status"];

const STATUS_VARIANT: Record<TxStatus, "default" | "destructive" | "secondary" | "outline"> = {
  success: "default",
  failed: "destructive",
  abandoned: "outline",
};

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

function TransactionRow({ tx }: { tx: PaystackTransaction }) {
  return (
    <TableRow>
      <TableCell className="font-mono text-xs">{tx.reference}</TableCell>
      <TableCell>{formatAmount(tx.amount)}</TableCell>
      <TableCell>
        <Badge variant={STATUS_VARIANT[tx.status]} className="capitalize">
          {tx.status}
        </Badge>
      </TableCell>
      <TableCell className="text-muted-foreground">{tx.customer.email}</TableCell>
      <TableCell className="capitalize">{tx.channel}</TableCell>
      <TableCell className="text-muted-foreground text-sm">{formatDate(tx.paid_at)}</TableCell>
    </TableRow>
  );
}

function TableSkeleton() {
  return (
    <>
      {Array.from({ length: 10 }).map((_, i) => (
        <TableRow key={i}>
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
  const [page, setPage] = useState(1);

  const { data, isLoading, isError, error } = useQuery({
    queryKey: ["paystack-transactions", page, PER_PAGE],
    queryFn: () => fetchPaystackTransactions({ data: { page, perPage: PER_PAGE } }),
    staleTime: 60_000,
    placeholderData: (previousData) => previousData,
  });

  const meta = data?.meta;
  const transactions = data?.data ?? [];

  return (
    <div className="flex flex-col gap-6 p-6 max-w-6xl mx-auto w-full">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="bg-primary/10 rounded-full p-3">
            <CreditCard className="size-6 text-primary" />
          </div>
          <div>
            <h1 className="text-2xl font-bold tracking-tight">Payments</h1>
            {meta && (
              <p className="text-sm text-muted-foreground">
                {meta.total.toLocaleString()} transactions total
              </p>
            )}
          </div>
        </div>
      </div>

      {isError && (
        <div className="flex items-center gap-2 text-red-600 text-sm bg-red-50 rounded-lg p-4 border border-red-200">
          <AlertCircle className="size-4 shrink-0" />
          <span>
            Failed to load payments:{" "}
            {error instanceof Error ? error.message : "Unknown error"}
          </span>
        </div>
      )}

      <div className="rounded-lg border overflow-hidden">
        <Table>
          <TableHeader>
            <TableRow className="bg-muted/50">
              <TableHead>Reference</TableHead>
              <TableHead>Amount</TableHead>
              <TableHead>Status</TableHead>
              <TableHead>Customer</TableHead>
              <TableHead>Channel</TableHead>
              <TableHead>Date</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {isLoading ? (
              <TableSkeleton />
            ) : transactions.length === 0 ? (
              <TableRow>
                <TableCell colSpan={6} className="text-center text-muted-foreground py-12">
                  No transactions found
                </TableCell>
              </TableRow>
            ) : (
              transactions.map((tx) => <TransactionRow key={tx.id} tx={tx} />)
            )}
          </TableBody>
        </Table>
      </div>

      {meta && meta.pageCount > 1 && (
        <div className="flex items-center justify-between">
          <p className="text-sm text-muted-foreground">
            Page {meta.page} of {meta.pageCount}
          </p>
          <div className="flex gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={() => setPage((p) => Math.max(1, p - 1))}
              disabled={page <= 1 || isLoading}
            >
              <ChevronLeft className="size-4 mr-1" />
              Previous
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={() => setPage((p) => p + 1)}
              disabled={page >= meta.pageCount || isLoading}
            >
              Next
              <ChevronRight className="size-4 ml-1" />
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}
