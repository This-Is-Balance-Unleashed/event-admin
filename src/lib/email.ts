import { Resend } from "resend";
import { createServerFn } from "@tanstack/react-start";
import { supabaseClient } from "./supabase-provider";
import { buildEmailHtml, type EmailRecipient, type IncludeFields } from "./email-template";

function toMessage(err: unknown): string {
  if (!err) return "Unknown error";
  if (err instanceof Error) return err.message;
  if (typeof err === "object" && "message" in err)
    return String((err as { message: unknown }).message);
  return String(err);
}

function getResend(): Resend {
  const key = process.env.RESEND_API_KEY;
  if (!key) throw new Error("RESEND_API_KEY is not set");
  return new Resend(key);
}

export type EmailTicket = {
  id: string;
  email: string;
  name?: string;
  status: string;
  ticketTypeName?: string;
  pricePaid?: number;
  reference?: string;
  qrCodeUrl?: string;
};

export type SendEmailInput = {
  recipients: EmailRecipient[];
  subject: string;
  message: string;
  includeFields: IncludeFields;
};

export type SendEmailResult = {
  sent: number;
  failed: Array<{ email: string; error: string }>;
};

export async function fetchEmailTicketsHandler(
  params: {
    search?: string;
    status?: string;
  } = {},
): Promise<EmailTicket[]> {
  // Fetch tickets without join to avoid schema-cache issues
  let query = supabaseClient
    .from("tickets")
    .select("id, email, name, status, price_paid, paystack_reference, qr_code_url, ticket_type_id")
    .order("created_at", { ascending: false });

  if (params.search) {
    query = query.ilike("email", `%${params.search}%`);
  }
  if (params.status) {
    query = query.eq("status", params.status);
  }

  const { data, error } = await query;
  if (error || !data) throw new Error(toMessage(error));

  const realData = data.filter((row) => !row.paystack_reference?.toLowerCase().startsWith("test_"));

  // Fetch ticket type names separately and build a lookup map
  const { data: ticketTypes } = await supabaseClient.from("ticket_types").select("id, name");

  const typeMap = new Map((ticketTypes ?? []).map((t) => [t.id, t.name as string]));

  return realData.map((row) => ({
    id: row.id,
    email: row.email,
    name: row.name ?? undefined,
    status: row.status,
    ticketTypeName: typeMap.get(row.ticket_type_id) ?? undefined,
    pricePaid: row.price_paid ?? undefined,
    reference: row.paystack_reference ?? undefined,
    qrCodeUrl: row.qr_code_url ?? undefined,
  }));
}

const RESEND_BATCH_LIMIT = 100;

// Accepts plain `email@example.com` or `Name <email@example.com>`
const EMAIL_RE = /^(?:[^<@\s]+@[^@\s]+\.[^@\s]+|.+<[^<@\s]+@[^@\s]+\.[^@\s]+>)$/;

function isValidEmailAddress(value: string): boolean {
  return EMAIL_RE.test(value.trim());
}

export async function sendTicketEmailsHandler(input: SendEmailInput): Promise<SendEmailResult> {
  if (input.recipients.length === 0) return { sent: 0, failed: [] };

  const resend = getResend();
  const fromEmail = process.env.RESEND_FROM_EMAIL ?? "events@balanceunleashed.org";

  const failed: Array<{ email: string; error: string }> = [];

  // Pre-validate every recipient email before touching Resend
  const validRecipients = input.recipients.filter((r) => {
    if (!isValidEmailAddress(r.email)) {
      failed.push({
        email: r.email,
        error: `Invalid email address: must be email@example.com or Name <email@example.com>`,
      });
      return false;
    }
    return true;
  });

  if (validRecipients.length === 0) return { sent: 0, failed };

  const emails = validRecipients.map((r) => ({
    from: `Hit Refresh Conference <${fromEmail}>`,
    to: r.email,
    subject: input.subject,
    html: buildEmailHtml(r, input.includeFields, input.message, input.subject),
  }));

  // Split into batches of ≤100 (Resend batch limit)
  let sent = 0;

  for (let i = 0; i < emails.length; i += RESEND_BATCH_LIMIT) {
    const chunk = emails.slice(i, i + RESEND_BATCH_LIMIT);
    const { data, error } = await resend.batch.send(chunk);
    if (error) {
      // Mark every recipient in this chunk as failed
      for (const r of validRecipients.slice(i, i + RESEND_BATCH_LIMIT)) {
        failed.push({ email: r.email, error: toMessage(error) });
      }
    } else {
      sent += (data?.data ?? []).length;
    }
  }

  return { sent, failed };
}

export const fetchEmailTickets = createServerFn({ method: "POST" })
  .inputValidator((input: { search?: string; status?: string }) => input)
  .handler(({ data }) => fetchEmailTicketsHandler(data ?? {}));

export const sendTicketEmails = createServerFn({ method: "POST" })
  .inputValidator((input: SendEmailInput) => input)
  .handler(({ data }) => sendTicketEmailsHandler(data));
