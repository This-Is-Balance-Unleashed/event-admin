import { Badge } from "@/components/ui/badge";

type Status = "reserved" | "paid" | "failed" | "used";

const variants: Record<Status, React.ComponentProps<typeof Badge>["variant"]> = {
  paid: "default", // green
  used: "secondary", // grey
  reserved: "outline", // neutral
  failed: "destructive", // red
};

export function TicketStatusBadge({ status }: { status: Status }) {
  return <Badge variant={variants[status] ?? "outline"}>{status}</Badge>;
}
