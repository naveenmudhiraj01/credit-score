import { google } from "googleapis";
import type { PaymentOrder } from "@prisma/client";

const SHEET_VARS = ["GOOGLE_SHEET_ID", "GOOGLE_SERVICE_ACCOUNT_EMAIL", "GOOGLE_PRIVATE_KEY"] as const;
/** Names (never values) of missing Google Sheets settings. */
export const missingSheetsEnv = () => SHEET_VARS.filter((k) => !process.env[k]);
export const sheetsConfigured = () => missingSheetsEnv().length === 0;

export const SHEET_HEADERS = [
  "Order ID", "Product", "Customer Name", "Email", "Mobile", "Amount",
  "Payment Status", "Payment ID", "Email Status", "Sheet Status", "Created",
  "Consent", "Review Status", "Review Deadline",
];

// Serialise upserts inside one server process to avoid duplicate appends.
let chain: Promise<unknown> = Promise.resolve();

export function buildSheetRow(o: PaymentOrder): string[] {
  return [
    o.receipt,
    o.product,
    o.customerName ?? "",
    o.customerEmail ?? "",
    o.customerMobile ?? "",
    `₹${o.amount / 100}`,
    o.status === "CREATED" ? "PENDING" : o.status,
    o.razorpayPaymentId ?? "",
    o.emailStatus === "SENT" ? "ACCEPTED (delivery unconfirmed)" : o.emailStatus,
    "SYNCED",
    o.createdAt.toISOString(),
    o.consentGiven ? "ACCEPTED" : "NOT_RECORDED",
    o.reviewStatus,
    o.reviewDeadline ? o.reviewDeadline.toISOString() : "",
  ];
}

/** Idempotent upsert keyed on Order ID (column A). Writes the header row if the tab is empty. */
export function upsertOrderRow(o: PaymentOrder): Promise<void> {
  const run = async () => {
    const rawKey = process.env.GOOGLE_PRIVATE_KEY ?? "";
    const cleanKey = rawKey.replace(/^["']|["']$/g, "").replace(/\\n/g, "\n").trim();
    const auth = new google.auth.JWT({
      email: process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL,
      key: cleanKey,
      scopes: ["https://www.googleapis.com/auth/spreadsheets"],
    });
    const sheets = google.sheets({ version: "v4", auth });
    const spreadsheetId = process.env.GOOGLE_SHEET_ID!;
    const tab = `'${(process.env.GOOGLE_SHEET_TAB ?? "Customer_Payments").replace(/'/g, "''")}'`;
    const row = buildSheetRow(o);
    const existing = await sheets.spreadsheets.values.get({ spreadsheetId, range: `${tab}!A:A` });
    const values = existing.data.values ?? [];
    if (values.length === 0) {
      await sheets.spreadsheets.values.append({
        spreadsheetId, range: `${tab}!A:N`, valueInputOption: "RAW", insertDataOption: "INSERT_ROWS",
        requestBody: { values: [SHEET_HEADERS] },
      });
    }
    const idx = values.findIndex((r) => r[0] === o.receipt);
    // RAW: customer-supplied text is never interpreted as a formula.
    if (idx >= 0) {
      await sheets.spreadsheets.values.update({
        spreadsheetId, range: `${tab}!A${idx + 1}:N${idx + 1}`, valueInputOption: "RAW", requestBody: { values: [row] },
      });
    } else {
      await sheets.spreadsheets.values.append({
        spreadsheetId, range: `${tab}!A:N`, valueInputOption: "RAW", insertDataOption: "INSERT_ROWS", requestBody: { values: [row] },
      });
    }
  };
  const p = chain.then(run, run);
  chain = p.catch(() => undefined);
  return p;
}
