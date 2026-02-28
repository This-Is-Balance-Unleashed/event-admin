export type EmailRecipient = {
  name?: string;
  email: string;
  ticketTypeName?: string;
  pricePaid?: number;
  reference?: string;
  qrCodeUrl?: string;
  zoomUrl?: string;
};

export type IncludeFields = {
  name: boolean;
  ticketType: boolean;
  qrCode: boolean;
  dateVenue: boolean;
  pricePaid: boolean;
  reference: boolean;
};

const BRAND = {
  green: "#39B54A",
  orange: "#FF8E00",
  bg: "#f5f1ed",
  text: "#1a1a1a",
  mutedText: "#555555",
  white: "#ffffff",
};

const EVENT = {
  name: "Hit Refresh Conference",
  tagline: "It's Time To Breathe Again",
  date: "February 28, 2026",
  venue: "Pistis Annex, Marwa, Lekki, Lagos",
  email: "events@balanceunleashed.org",
};

function fieldRow(label: string, value: string): string {
  return `
    <tr>
      <td style="padding:6px 0;border-bottom:1px solid #e5e5e5;">
        <span style="font-size:12px;color:${BRAND.mutedText};font-family:Arial,sans-serif;text-transform:uppercase;letter-spacing:0.05em;">${label}</span><br/>
        <span style="font-size:15px;color:${BRAND.text};font-family:Arial,sans-serif;font-weight:600;">${value}</span>
      </td>
    </tr>`;
}

export function buildEmailHtml(
  recipient: EmailRecipient,
  fields: IncludeFields,
  message: string,
  subject: string,
): string {
  const priceFormatted =
    recipient.pricePaid != null ? `₦${(recipient.pricePaid / 100).toLocaleString("en-NG")}` : "";

  const detailRows = [
    fields.name && recipient.name ? fieldRow("Attendee Name", recipient.name) : "",
    fields.ticketType && recipient.ticketTypeName
      ? fieldRow("Ticket Type", recipient.ticketTypeName)
      : "",
    fields.pricePaid && priceFormatted ? fieldRow("Price Paid", priceFormatted) : "",
    fields.reference && recipient.reference ? fieldRow("Reference", recipient.reference) : "",
    fields.dateVenue ? fieldRow("Date", `${EVENT.date} · Registration 8am | Event 9am`) : "",
    fields.dateVenue ? fieldRow("Venue", EVENT.venue) : "",
  ]
    .filter(Boolean)
    .join("");

  const ctaButton = (() => {
    if (!fields.qrCode) return "";
    if (recipient.zoomUrl) {
      return `
  <tr>
    <td style="padding:24px 0 8px;text-align:center;">
      <a href="${recipient.zoomUrl}"
         style="display:inline-block;background-color:${BRAND.green};color:${BRAND.white};
                text-decoration:none;font-family:Arial,sans-serif;font-size:16px;
                font-weight:bold;padding:14px 32px;border-radius:6px;">
        Join Hit Refresh
      </a>
      <p style="margin:8px 0 0;font-size:11px;color:${BRAND.mutedText};font-family:Arial,sans-serif;">
        Use this link to join the virtual stream on the event day
      </p>
    </td>
  </tr>`;
    }
    if (recipient.qrCodeUrl) {
      return `
  <tr>
    <td style="padding:24px 0 8px;text-align:center;">
      <a href="${recipient.qrCodeUrl}"
         style="display:inline-block;background-color:${BRAND.green};color:${BRAND.white};
                text-decoration:none;font-family:Arial,sans-serif;font-size:16px;
                font-weight:bold;padding:14px 32px;border-radius:6px;">
        View Your QR Code
      </a>
      <p style="margin:8px 0 0;font-size:11px;color:${BRAND.mutedText};font-family:Arial,sans-serif;">
        Show this at the entrance on the event day
      </p>
    </td>
  </tr>`;
    }
    return "";
  })();

  const customMessageBlock = message
    ? `
    <tr>
      <td style="padding:16px 0;">
        <p style="margin:0;font-size:15px;line-height:1.6;color:${BRAND.text};font-family:Arial,sans-serif;">
          ${message.replace(/\n/g, "<br/>")}
        </p>
      </td>
    </tr>`
    : "";

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8"/>
  <meta name="viewport" content="width=device-width,initial-scale=1.0"/>
  <title>${subject || EVENT.name}</title>
</head>
<body style="margin:0;padding:0;background-color:${BRAND.bg};">
  <table width="100%" cellpadding="0" cellspacing="0" style="background-color:${BRAND.bg};padding:32px 16px;">
    <tr>
      <td align="center">
        <table width="600" cellpadding="0" cellspacing="0" style="max-width:600px;width:100%;background-color:${BRAND.white};border-radius:8px;overflow:hidden;box-shadow:0 2px 8px rgba(0,0,0,0.08);">

          <!-- Header -->
          <tr>
            <td style="background-color:${BRAND.green};padding:28px 32px;">
              <p style="margin:0;font-size:22px;font-weight:bold;color:${BRAND.white};font-family:Georgia,'Times New Roman',serif;letter-spacing:-0.02em;">Hit Refresh</p>
              <p style="margin:6px 0 0;font-size:13px;color:rgba(255,255,255,0.85);font-family:Arial,sans-serif;">
                Career and Wellness Summit 2026
              </p>
            </td>
          </tr>

          <!-- Hero tagline -->
          <tr>
            <td style="padding:24px 32px 8px;border-bottom:3px solid ${BRAND.orange};">
              <p style="margin:0;font-size:26px;font-family:Georgia,'Times New Roman',serif;color:${BRAND.text};line-height:1.3;">
                ${EVENT.tagline}
              </p>
            </td>
          </tr>

          <!-- Body -->
          <tr>
            <td style="padding:24px 32px;">
              <table width="100%" cellpadding="0" cellspacing="0">

                ${customMessageBlock}

                ${
                  detailRows
                    ? `<tr><td style="padding:16px 0 8px;">
                  <table width="100%" cellpadding="0" cellspacing="0">
                    ${detailRows}
                  </table>
                </td></tr>`
                    : ""
                }

                ${ctaButton}

              </table>
            </td>
          </tr>

          <!-- Footer -->
          <tr>
            <td style="background-color:#f8f8f8;padding:20px 32px;border-top:1px solid #e5e5e5;">
              <p style="margin:0;font-size:12px;color:${BRAND.mutedText};font-family:Arial,sans-serif;text-align:center;">
                Questions? Reply to
                <a href="mailto:${EVENT.email}" style="color:${BRAND.green};">${EVENT.email}</a>
              </p>
              <p style="margin:8px 0 0;font-size:11px;color:#999;font-family:Arial,sans-serif;text-align:center;">
                © 2026 Balance Unleashed · Pistis Annex, Marwa, Lekki, Lagos
              </p>
            </td>
          </tr>

        </table>
      </td>
    </tr>
  </table>
</body>
</html>`;
}
