import { ScanLine } from "lucide-react";
import { CheckInForm } from "@/components/admin/check-in-form";

export function CheckInPage() {
  return (
    <div className="flex flex-col gap-6 py-6 px-4 max-w-2xl mx-auto w-full">
      <div className="text-center space-y-1">
        <div className="flex justify-center">
          <div className="bg-primary/10 rounded-full p-4">
            <ScanLine className="size-8 text-primary" />
          </div>
        </div>
        <h1 className="text-2xl font-bold tracking-tight">Event Check-in</h1>
        <p className="text-muted-foreground text-sm">
          Search by attendee name, email, or scan the QR ticket code
        </p>
      </div>
      <CheckInForm />
    </div>
  );
}
