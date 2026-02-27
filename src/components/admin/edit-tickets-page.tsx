import { useState, useEffect } from "react";
import { useNotify } from "ra-core";
import { Pencil, Check, X, Search } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  fetchEditableTickets,
  bulkUpdateTicketType,
  updateTicket,
  type EditableTicket,
} from "@/lib/ticket-edit";
import { fetchTicketTypes } from "@/lib/ticket-create";

type TicketType = { id: string; name: string };

function InlineNameEdit({
  ticket,
  onSaved,
}: {
  ticket: EditableTicket;
  onSaved: (id: string, name: string) => void;
}) {
  const notify = useNotify();
  const [editing, setEditing] = useState(false);
  const [value, setValue] = useState(ticket.name ?? "");
  const [saving, setSaving] = useState(false);

  const save = async () => {
    if (!value.trim()) return;
    setSaving(true);
    try {
      await updateTicket({ data: { id: ticket.id, name: value.trim() } });
      onSaved(ticket.id, value.trim());
      setEditing(false);
    } catch (e) {
      notify(`Failed: ${e instanceof Error ? e.message : String(e)}`, { type: "error" });
    } finally {
      setSaving(false);
    }
  };

  if (!editing) {
    return (
      <button
        onClick={() => setEditing(true)}
        className="flex items-center gap-1 text-muted-foreground hover:text-foreground text-xs"
      >
        <Pencil className="size-3" />
        {ticket.name || "Add name"}
      </button>
    );
  }

  return (
    <div className="flex items-center gap-1">
      <Input
        value={value}
        onChange={(e) => setValue(e.target.value)}
        className="h-6 text-xs w-32"
        onKeyDown={(e) => {
          if (e.key === "Enter") save();
          if (e.key === "Escape") setEditing(false);
        }}
        autoFocus
      />
      <button onClick={save} disabled={saving} className="text-green-600 hover:text-green-700">
        <Check className="size-3.5" />
      </button>
      <button
        onClick={() => setEditing(false)}
        className="text-muted-foreground hover:text-foreground"
      >
        <X className="size-3.5" />
      </button>
    </div>
  );
}

export function EditTicketsPage() {
  const notify = useNotify();
  const [tickets, setTickets] = useState<EditableTicket[]>([]);
  const [ticketTypes, setTicketTypes] = useState<TicketType[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [moveToTypeId, setMoveToTypeId] = useState("");
  const [applying, setApplying] = useState(false);

  const visibleTickets = tickets.filter((t) => {
    const q = search.toLowerCase();
    return !q || t.email.toLowerCase().includes(q) || (t.name ?? "").toLowerCase().includes(q);
  });

  useEffect(() => {
    setLoading(true);
    Promise.all([fetchEditableTickets({ data: {} }), fetchTicketTypes()])
      .then(([t, types]) => {
        setTickets(Array.isArray(t) ? t : []);
        setTicketTypes(Array.isArray(types) ? types : []);
      })
      .catch((e) =>
        notify(`Failed to load: ${e instanceof Error ? e.message : String(e)}`, { type: "error" }),
      )
      .finally(() => setLoading(false));
  }, []);

  const allSelected =
    visibleTickets.length > 0 && visibleTickets.every((t) => selectedIds.has(t.id));

  const toggleAll = () => {
    if (allSelected) {
      setSelectedIds((prev) => {
        const next = new Set(prev);
        visibleTickets.forEach((t) => next.delete(t.id));
        return next;
      });
    } else {
      setSelectedIds((prev) => {
        const next = new Set(prev);
        visibleTickets.forEach((t) => next.add(t.id));
        return next;
      });
    }
  };

  const toggleRow = (id: string) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  };

  const handleNameSaved = (id: string, name: string) => {
    setTickets((prev) => prev.map((t) => (t.id === id ? { ...t, name } : t)));
  };

  const handleApply = async () => {
    if (!moveToTypeId || selectedIds.size === 0) return;
    setApplying(true);
    try {
      await bulkUpdateTicketType({
        data: { ids: [...selectedIds], ticketTypeId: moveToTypeId },
      });
      const typeName = ticketTypes.find((t) => t.id === moveToTypeId)?.name ?? moveToTypeId;
      setTickets((prev) =>
        prev.map((t) =>
          selectedIds.has(t.id)
            ? { ...t, ticket_type_id: moveToTypeId, ticketTypeName: typeName }
            : t,
        ),
      );
      notify(
        `Moved ${selectedIds.size} ticket${selectedIds.size !== 1 ? "s" : ""} to ${typeName}`,
        {
          type: "success",
        },
      );
      setSelectedIds(new Set());
      setMoveToTypeId("");
    } catch (e) {
      notify(`Failed: ${e instanceof Error ? e.message : String(e)}`, { type: "error" });
    } finally {
      setApplying(false);
    }
  };

  return (
    <div className="p-6 max-w-5xl mx-auto">
      <div className="mb-6 flex items-center gap-3">
        <Pencil className="size-5 text-primary" />
        <h1 className="text-2xl font-semibold">Edit Tickets</h1>
      </div>

      <div className="mb-3 relative">
        <Search className="absolute left-2.5 top-2.5 size-3.5 text-muted-foreground" />
        <Input
          placeholder="Search by name or email…"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="pl-8 h-8 text-sm"
        />
      </div>

      <div className="rounded-lg border bg-card overflow-auto">
        <table className="w-full text-sm">
          <thead className="sticky top-0 bg-muted/60">
            <tr>
              <th className="p-3 w-8">
                <Checkbox
                  checked={allSelected}
                  onCheckedChange={toggleAll}
                  aria-label="Select all"
                />
              </th>
              <th className="p-3 text-left font-medium text-muted-foreground">Name</th>
              <th className="p-3 text-left font-medium text-muted-foreground">Email</th>
              <th className="p-3 text-left font-medium text-muted-foreground">Status</th>
              <th className="p-3 text-left font-medium text-muted-foreground">Ticket Type</th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr>
                <td colSpan={5} className="p-6 text-center text-muted-foreground text-xs">
                  Loading…
                </td>
              </tr>
            ) : visibleTickets.length === 0 ? (
              <tr>
                <td colSpan={5} className="p-6 text-center text-muted-foreground text-xs">
                  {tickets.length === 0 ? "No tickets found" : "No tickets match your search"}
                </td>
              </tr>
            ) : (
              visibleTickets.map((t) => (
                <tr
                  key={t.id}
                  className="border-t hover:bg-muted/30 transition-colors"
                  onClick={() => toggleRow(t.id)}
                >
                  <td className="p-3">
                    <Checkbox
                      checked={selectedIds.has(t.id)}
                      onCheckedChange={() => toggleRow(t.id)}
                      onClick={(e) => e.stopPropagation()}
                    />
                  </td>
                  <td className="p-3" onClick={(e) => e.stopPropagation()}>
                    <InlineNameEdit ticket={t} onSaved={handleNameSaved} />
                  </td>
                  <td className="p-3 text-muted-foreground">{t.email}</td>
                  <td className="p-3">
                    <Badge variant="outline" className="capitalize text-xs">
                      {t.status}
                    </Badge>
                  </td>
                  <td className="p-3 text-muted-foreground">{t.ticketTypeName ?? "—"}</td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      {/* Sticky action bar */}
      {selectedIds.size > 0 && (
        <div className="fixed bottom-6 left-1/2 -translate-x-1/2 flex items-center gap-3 bg-background border shadow-lg rounded-lg px-4 py-3">
          <span className="text-sm font-medium">{selectedIds.size} selected</span>
          <span className="text-muted-foreground text-sm">Move to:</span>
          <Select value={moveToTypeId} onValueChange={setMoveToTypeId}>
            <SelectTrigger className="w-36 h-8 text-sm">
              <SelectValue placeholder="Ticket type…" />
            </SelectTrigger>
            <SelectContent>
              {ticketTypes.map((tt) => (
                <SelectItem key={tt.id} value={tt.id}>
                  {tt.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Button size="sm" onClick={handleApply} disabled={!moveToTypeId || applying}>
            {applying ? "Applying…" : "Apply"}
          </Button>
          <Button size="sm" variant="ghost" onClick={() => setSelectedIds(new Set())}>
            Clear
          </Button>
        </div>
      )}
    </div>
  );
}
