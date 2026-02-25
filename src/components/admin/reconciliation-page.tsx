import { useState, useRef, useEffect } from "react";
import { useNotify } from "ra-core";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { RefreshCw, AlertCircle, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { fetchReconciliationData, resolveTickets } from "@/lib/reconciliation";
import type { AffectedTicket } from "@/lib/reconciliation";

function formatAmount(kobo: number) {
  return `₦${(kobo / 100).toLocaleString("en-NG")}`;
}

function formatDate(dateStr: string) {
  return new Date(dateStr).toLocaleString("en-NG", {
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function TableSkeleton() {
  return (
    <>
      {Array.from({ length: 10 }).map((_, i) => (
        <TableRow key={i}>
          {Array.from({ length: 8 }).map((_, j) => (
            <TableCell key={j}>
              <Skeleton className="h-4 w-full" />
            </TableCell>
          ))}
        </TableRow>
      ))}
    </>
  );
}

function SelectAllCheckbox({
  tickets,
  selectedIds,
  onToggleAll,
}: {
  tickets: AffectedTicket[];
  selectedIds: Set<string>;
  onToggleAll: (checked: boolean) => void;
}) {
  const ref = useRef<HTMLInputElement>(null);
  const allSelected = tickets.length > 0 && selectedIds.size === tickets.length;
  const isIndeterminate = selectedIds.size > 0 && selectedIds.size < tickets.length;

  useEffect(() => {
    if (ref.current) {
      ref.current.indeterminate = isIndeterminate;
    }
  }, [isIndeterminate]);

  return (
    <input
      ref={ref}
      type="checkbox"
      checked={allSelected}
      onChange={(e) => onToggleAll(e.target.checked)}
      className="h-4 w-4 cursor-pointer accent-primary"
      aria-label="Select all tickets"
    />
  );
}

export function ReconciliationPage() {
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const notify = useNotify();
  const queryClient = useQueryClient();

  const {
    data: tickets = [],
    isLoading,
    isError,
    error,
    refetch,
  } = useQuery({
    queryKey: ["reconciliation-data"],
    queryFn: () => fetchReconciliationData(),
    staleTime: 0,
  });

  const { mutate: resolve, isPending } = useMutation({
    mutationFn: (ticketIds: string[]) => resolveTickets({ data: { ticketIds } }),
    onSuccess: (result) => {
      queryClient.invalidateQueries({ queryKey: ["reconciliation-data"] });
      notify(`${result.resolved} tickets resolved`, { type: "success" });
      if (result.errors.length > 0) {
        notify(`${result.errors.length} tickets failed to resolve`, { type: "warning" });
      }
      setSelectedIds(new Set());
    },
    onError: (err: Error) => {
      notify(err.message, { type: "error" });
    },
  });

  const handleToggleRow = (id: string, checked: boolean) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (checked) {
        next.add(id);
      } else {
        next.delete(id);
      }
      return next;
    });
  };

  const handleToggleAll = (checked: boolean) => {
    if (checked) {
      setSelectedIds(new Set(tickets.map((t) => t.id)));
    } else {
      setSelectedIds(new Set());
    }
  };

  const handleResolveSelected = () => {
    resolve(Array.from(selectedIds));
  };

  return (
    <div className="flex flex-col gap-6 p-6 w-full">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="bg-primary/10 rounded-full p-3">
            <RefreshCw className="size-6 text-primary" />
          </div>
          <div className="flex items-center gap-2">
            <h1 className="text-2xl font-bold tracking-tight">Payment Reconciliation</h1>
            {!isLoading && tickets.length > 0 && (
              <span className="text-sm text-muted-foreground">
                {tickets.length} ticket{tickets.length !== 1 ? "s" : ""} need resolution
              </span>
            )}
          </div>
        </div>
        <Button variant="outline" size="icon" onClick={() => refetch()} aria-label="Refresh">
          <RefreshCw className="size-4" />
        </Button>
      </div>

      {isError && (
        <div className="flex items-center gap-2 text-red-600 text-sm bg-red-50 rounded-lg p-4 border border-red-200">
          <AlertCircle className="size-4 shrink-0" />
          <span>
            Failed to load reconciliation data:{" "}
            {error instanceof Error ? error.message : "Unknown error"}
          </span>
        </div>
      )}

      {!isLoading && tickets.length > 0 && (
        <div className="flex items-center gap-3">
          <SelectAllCheckbox
            tickets={tickets}
            selectedIds={selectedIds}
            onToggleAll={handleToggleAll}
          />
          <span className="text-sm text-muted-foreground">
            {selectedIds.size > 0 ? `${selectedIds.size} selected` : "Select all"}
          </span>
          <Button
            variant="default"
            size="sm"
            disabled={selectedIds.size === 0 || isPending}
            onClick={handleResolveSelected}
          >
            {isPending ? (
              <>
                <Loader2 className="size-4 mr-2 animate-spin" />
                Resolving...
              </>
            ) : (
              "Resolve Selected"
            )}
          </Button>
        </div>
      )}

      <div className="rounded-lg border overflow-hidden">
        <Table>
          <TableHeader>
            <TableRow className="bg-muted/50">
              <TableHead className="w-10">Select</TableHead>
              <TableHead>Email</TableHead>
              <TableHead>Name</TableHead>
              <TableHead>Reference</TableHead>
              <TableHead>Ticket Type</TableHead>
              <TableHead>Amount (₦)</TableHead>
              <TableHead>Paystack Date</TableHead>
              <TableHead>Group?</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {isLoading ? (
              <TableSkeleton />
            ) : tickets.length === 0 ? (
              <TableRow>
                <TableCell colSpan={8} className="text-center text-muted-foreground py-12">
                  No affected tickets found — all payments are reconciled!
                </TableCell>
              </TableRow>
            ) : (
              tickets.map((ticket) => (
                <TableRow key={ticket.id}>
                  <TableCell>
                    <Checkbox
                      checked={selectedIds.has(ticket.id)}
                      onCheckedChange={(checked) =>
                        handleToggleRow(ticket.id, checked === true)
                      }
                      aria-label={`Select ticket ${ticket.id}`}
                    />
                  </TableCell>
                  <TableCell>{ticket.email}</TableCell>
                  <TableCell>{ticket.name}</TableCell>
                  <TableCell className="font-mono text-xs">{ticket.paystack_reference}</TableCell>
                  <TableCell className="font-mono text-xs">{ticket.ticket_type_id}</TableCell>
                  <TableCell>{formatAmount(ticket.paystack_amount)}</TableCell>
                  <TableCell className="text-muted-foreground text-sm">
                    {formatDate(ticket.paystack_date)}
                  </TableCell>
                  <TableCell>
                    {ticket.is_group ? (
                      <Badge variant="secondary">Yes</Badge>
                    ) : (
                      <span className="text-muted-foreground">—</span>
                    )}
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}
