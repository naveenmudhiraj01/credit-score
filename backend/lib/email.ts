import nodemailer from "nodemailer";
import type { PaymentOrder } from "@prisma/client";
import { validateEmail } from "./validation.ts";

const EMAIL_VARS = ["SMTP_HOST", "SMTP_USER", "SMTP_PASS", "MAIL_FROM"] as const;

/** Names (never values) of missing email settings. */
export const missingEmailEnv = () => {
  return EMAIL_VARS.filter((k) => !process.env[k]?.trim());
};

export const emailConfigured = () => missingEmailEnv().length === 0;

/**
 * Resolves the admin notification email address strictly from server configuration:
 * 1. Database `SystemSetting` key `admin_notification_email` (if exists and valid)
 * 2. Environment variable `ADMIN_NOTIFICATION_EMAIL`
 * Never reads from client/form payload.
 */
export async function getAdminNotificationEmail(dbLookup?: () => Promise<string | null | undefined>): Promise<string> {
  if (dbLookup) {
    const dbVal = await dbLookup();
    if (dbVal?.trim()) {
      const result = validateEmail(dbVal);
      if (!result.valid) throw new Error("Configured admin notification email is invalid.");
      return result.value!;
    }
  }

  const envAdmin = process.env.ADMIN_NOTIFICATION_EMAIL?.trim();
  if (!envAdmin) throw new Error("ADMIN_NOTIFICATION_EMAIL is not configured.");
  const result = validateEmail(envAdmin);
  if (!result.valid) throw new Error("ADMIN_NOTIFICATION_EMAIL is invalid.");
  return result.value!;
}

/**
 * Sanitizes error messages to prevent leaking SMTP passwords, auth tokens,
 * or credentials into logs or the database.
 */
export function sanitizeEmailError(err: unknown): string {
  if (!err) return "Unknown email delivery error";
  let message = typeof err === "string" ? err : err instanceof Error ? err.message : String(err);

  const secretsToMask = [
    process.env.SMTP_USER,
    process.env.SMTP_PASS,
    process.env.ADMIN_PASSWORD,
    process.env.ADMIN_SESSION_SECRET,
    process.env.RAZORPAY_KEY_SECRET,
    process.env.RAZORPAY_WEBHOOK_SECRET,
  ].filter(Boolean) as string[];

  for (const secret of secretsToMask) {
    if (secret && secret.length > 2) {
      message = message.split(secret).join("[REDACTED]");
    }
  }

  message = message.replace(/(?:password|pass|secret|token|auth)=[^&\s]+/gi, "token=[REDACTED]");
  message = message.replace(/Bearer\s+[A-Za-z0-9\-._~+/]+=*/gi, "Bearer [REDACTED]");
  message = message.replace(/:\/\/([^:]+):([^@]+)@/g, "://$1:[REDACTED]@");

  return message.slice(0, 1000);
}

const esc = (s: string) =>
  s.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!);

function createTransporter() {
  const missingSmtp = missingEmailEnv();
  if (missingSmtp.length > 0) {
    throw new Error(`SMTP is not configured. Missing: ${missingSmtp.join(", ")}`);
  }

  const port = Number(process.env.SMTP_PORT ?? 587);
  if (!Number.isInteger(port) || port < 1 || port > 65535) {
    throw new Error("SMTP_PORT must be a valid TCP port.");
  }

  return nodemailer.createTransport({
    host: process.env.SMTP_HOST,
    port,
    secure: port === 465,
    requireTLS: port !== 465,
    auth: { user: process.env.SMTP_USER, pass: process.env.SMTP_PASS },
    connectionTimeout: 10_000,
    greetingTimeout: 10_000,
    socketTimeout: 30_000,
  });
}

type SmtpAcceptedInfo = {
  accepted?: Array<string | { address: string }>;
};

function verifySmtpAccepted(info: SmtpAcceptedInfo, recipientEmail: string) {
  const acceptedList = Array.isArray(info.accepted) ? info.accepted : [];
  const accepted = acceptedList.some((recipient: string | { address: string }) => {
    const address = typeof recipient === "string" ? recipient : recipient.address;
    return address.toLowerCase() === recipientEmail.toLowerCase();
  });
  if (!accepted) {
    throw new Error(`SMTP server did not accept the recipient ${recipientEmail}.`);
  }
}

/**
 * 1. Customer Payment Confirmation Email
 * Sent after verified server-side payment capture.
 * Preserves exact 72-hour SLA review text and layout.
 */
export async function sendConfirmationEmail(o: PaymentOrder, recipientEmail = o.customerEmail ?? ""): Promise<{ messageId: string }> {
  const recipient = validateEmail(recipientEmail);
  if (!recipient.valid) throw new Error("Customer email address on order is missing or invalid.");
  const support = process.env.SUPPORT_EMAIL ?? process.env.MAIL_FROM ?? "support@ffafinserv.com";
  const rupees = (o.amount / 100).toFixed(2);
  const date = (o.paidAt ?? new Date()).toLocaleString("en-IN", { timeZone: "Asia/Kolkata" });
  const subject = "Service Order Confirmation – FFA Finserv";

  const transporter = createTransporter();

  const text = `Dear Customer,

Thank you for choosing FFA Finserv and placing your service order.
We have successfully received your payment and registered your service request.

What happens next?
Our team will review the details you submitted and respond within 72 hours.

Order Reference: ${o.receipt}
Please retain this reference for future communication regarding your service request.

Regards,
Team FFA Finserv`;

  const html = `<div style="font-family:Arial,sans-serif;max-width:540px;margin:auto;border:1px solid #e2e8f0;border-radius:12px;padding:28px;background:#ffffff;color:#1e293b">
  <div style="border-bottom:2px solid #2563eb;padding-bottom:16px;margin-bottom:20px">
    <h2 style="color:#1d4ed8;margin:0;font-size:20px;letter-spacing:-0.5px">FFA FINSERV</h2>
    <p style="color:#64748b;font-size:12px;margin:4px 0 0;font-weight:600;text-transform:uppercase">Financial Assistance Services</p>
  </div>
  
  <p style="font-size:15px;line-height:1.6;margin:0 0 16px">Dear Customer,</p>
  <p style="font-size:15px;line-height:1.6;margin:0 0 16px">Thank you for choosing <b>FFA Finserv</b> and placing your service order.<br>We have successfully received your payment and registered your service request.</p>
  
  <div style="background:#f8fafc;border-left:4px solid #2563eb;border-radius:4px;padding:14px 16px;margin:20px 0">
    <h4 style="margin:0 0 6px;color:#0f172a;font-size:14px">What happens next?</h4>
    <p style="margin:0;font-size:14px;color:#475569;line-height:1.5">Our team will review the details you submitted and respond within <b>72 hours</b>.</p>
  </div>

  <div style="background:#eff6ff;border:1px solid #bfdbfe;border-radius:8px;padding:16px;margin:20px 0;text-align:center">
    <span style="font-size:12px;color:#1e40af;font-weight:600;text-transform:uppercase;letter-spacing:0.5px">Order Reference</span>
    <div style="font-size:20px;font-weight:bold;color:#1d4ed8;margin-top:4px;letter-spacing:1px">${esc(o.receipt)}</div>
  </div>

  <table style="width:100%;border-collapse:collapse;font-size:13px;margin:16px 0;border-top:1px solid #f1f5f9;border-bottom:1px solid #f1f5f9">
    <tr><td style="padding:8px 0;color:#64748b">Service</td><td style="padding:8px 0;text-align:right;font-weight:600;color:#0f172a">${esc(o.product)}</td></tr>
    <tr><td style="padding:8px 0;color:#64748b">Amount Paid</td><td style="padding:8px 0;text-align:right;font-weight:600;color:#0f172a">₹${rupees}</td></tr>
    <tr><td style="padding:8px 0;color:#64748b">Payment ID</td><td style="padding:8px 0;text-align:right;font-weight:600;color:#0f172a">${esc(o.razorpayPaymentId ?? "—")}</td></tr>
    <tr><td style="padding:8px 0;color:#64748b">Date</td><td style="padding:8px 0;text-align:right;font-weight:600;color:#0f172a">${esc(date)}</td></tr>
  </table>

  <p style="font-size:14px;color:#475569;line-height:1.6;margin:16px 0">Please retain this reference for future communication regarding your service request.</p>

  <p style="font-size:14px;color:#334155;margin:24px 0 0;line-height:1.6">
    Regards,<br>
    <b>Team FFA Finserv</b>
  </p>
</div>`;

  const info = await transporter.sendMail({
    from: process.env.MAIL_FROM,
    to: recipient.value,
    replyTo: support,
    subject,
    text,
    html,
  });

  verifySmtpAccepted(info, recipient.value!);
  return { messageId: info.messageId };
}

/**
 * 2. Admin Payment Notification Email
 * Sent after verified server-side payment capture to notify the admin team.
 */
export async function sendAdminPaymentNotificationEmail(o: PaymentOrder, overrideAdminEmail?: string): Promise<{ messageId: string }> {
  const adminEmail = overrideAdminEmail
    ? validateEmail(overrideAdminEmail).value
    : await getAdminNotificationEmail();
  if (!adminEmail || !validateEmail(adminEmail).valid) {
    throw new Error("Configured admin notification email is missing or invalid.");
  }
  const rupees = (o.amount / 100).toFixed(2);
  const date = (o.paidAt ?? new Date()).toLocaleString("en-IN", { timeZone: "Asia/Kolkata" });
  const deadline = o.reviewDeadline ? o.reviewDeadline.toLocaleString("en-IN", { timeZone: "Asia/Kolkata" }) : "72 hours from payment";
  const subject = `[Payment Received] ${o.receipt} - ₹${rupees} by ${o.customerName || "Customer"}`;

  const transporter = createTransporter();

  const text = `FFA Finserv Admin Alert - Payment Received

A payment has been verified and confirmed.

Order Reference: ${o.receipt}
Payment ID: ${o.razorpayPaymentId ?? "—"}
Amount: ₹${rupees}
Service: ${o.product}
Payment Status: PAID

Customer Details:
Name: ${o.customerName || "—"}
Email: ${o.customerEmail || "—"}
Mobile: ${o.customerMobile || "—"}
DOB: ${o.customerDob || "—"}

Payment Date: ${date}
Review SLA Deadline: ${deadline}
Review Status: PENDING_REVIEW`;

  const html = `<div style="font-family:Arial,sans-serif;max-width:560px;margin:auto;border:1px solid #e2e8f0;border-radius:12px;padding:28px;background:#ffffff;color:#1e293b">
  <div style="border-bottom:2px solid #16a34a;padding-bottom:14px;margin-bottom:20px">
    <span style="background:#dcfce7;color:#15803d;font-size:11px;font-weight:700;padding:4px 8px;border-radius:4px;text-transform:uppercase;letter-spacing:0.5px">Payment Verified</span>
    <h2 style="color:#0f172a;margin:8px 0 0;font-size:20px">₹${rupees} Received</h2>
  </div>

  <table style="width:100%;border-collapse:collapse;font-size:13px;margin:16px 0">
    <tr><td style="padding:6px 0;color:#64748b">Order Reference</td><td style="padding:6px 0;text-align:right;font-weight:bold;color:#1d4ed8">${esc(o.receipt)}</td></tr>
    <tr><td style="padding:6px 0;color:#64748b">Razorpay Payment ID</td><td style="padding:6px 0;text-align:right;font-weight:600;color:#0f172a">${esc(o.razorpayPaymentId ?? "—")}</td></tr>
    <tr><td style="padding:6px 0;color:#64748b">Service</td><td style="padding:6px 0;text-align:right;font-weight:600;color:#0f172a">${esc(o.product)}</td></tr>
    <tr><td style="padding:6px 0;color:#64748b">Amount</td><td style="padding:6px 0;text-align:right;font-weight:bold;color:#16a34a">₹${rupees}</td></tr>
    <tr><td style="padding:6px 0;color:#64748b">Payment Status</td><td style="padding:6px 0;text-align:right;font-weight:600;color:#16a34a">PAID</td></tr>
    <tr><td style="padding:6px 0;color:#64748b">Payment Timestamp</td><td style="padding:6px 0;text-align:right;color:#0f172a">${esc(date)}</td></tr>
  </table>

  <h4 style="margin:20px 0 8px;color:#0f172a;font-size:14px;border-bottom:1px solid #f1f5f9;padding-bottom:6px">Customer Profile</h4>
  <table style="width:100%;border-collapse:collapse;font-size:13px">
    <tr><td style="padding:6px 0;color:#64748b">Full Name</td><td style="padding:6px 0;text-align:right;font-weight:600;color:#0f172a">${esc(o.customerName || "—")}</td></tr>
    <tr><td style="padding:6px 0;color:#64748b">Email ID</td><td style="padding:6px 0;text-align:right;font-weight:600;color:#0f172a">${esc(o.customerEmail || "—")}</td></tr>
    <tr><td style="padding:6px 0;color:#64748b">Mobile Number</td><td style="padding:6px 0;text-align:right;font-weight:600;color:#0f172a">${esc(o.customerMobile || "—")}</td></tr>
    <tr><td style="padding:6px 0;color:#64748b">Date of Birth</td><td style="padding:6px 0;text-align:right;color:#0f172a">${esc(o.customerDob || "—")}</td></tr>
  </table>

  <div style="background:#fefce8;border:1px solid #fde047;border-radius:6px;padding:12px;margin:20px 0;font-size:13px;color:#854d0e">
    <b>SLA Notice:</b> Response required within 72 hours (Deadline: <b>${esc(deadline)}</b>).
  </div>
</div>`;

  const info = await transporter.sendMail({
    from: process.env.MAIL_FROM,
    to: adminEmail,
    subject,
    text,
    html,
  });

  verifySmtpAccepted(info, adminEmail);
  return { messageId: info.messageId };
}

/**
 * 3. Customer Application Received Email
 * Sent dynamically upon customer registration save.
 */
export async function sendApplicationReceivedEmail(o: PaymentOrder, recipientEmail = o.customerEmail ?? ""): Promise<{ messageId: string }> {
  const recipient = validateEmail(recipientEmail);
  if (!recipient.valid) throw new Error("Customer email address on order is missing or invalid.");
  const support = process.env.SUPPORT_EMAIL ?? process.env.MAIL_FROM ?? "support@ffafinserv.com";
  const rupees = (o.amount / 100).toFixed(2);
  const date = (o.createdAt ?? new Date()).toLocaleString("en-IN", { timeZone: "Asia/Kolkata" });
  const subject = `Application Received – FFA Finserv (${o.receipt})`;

  const transporter = createTransporter();

  const text = `Dear ${o.customerName || "Customer"},

Thank you for applying with FFA Finserv for ${o.product}.
We have successfully registered your application.

Application Reference: ${o.receipt}
Selected Service: ${o.product}
Service Fee: ₹${rupees}
Date Submitted: ${date}

Next Steps:
To proceed with your application, please complete the payment step. Once payment is verified, our verification team will review your application within 72 hours.

If you have already paid, you will receive a separate payment confirmation email shortly.

Regards,
Team FFA Finserv`;

  const html = `<div style="font-family:Arial,sans-serif;max-width:540px;margin:auto;border:1px solid #e2e8f0;border-radius:12px;padding:28px;background:#ffffff;color:#1e293b">
  <div style="border-bottom:2px solid #2563eb;padding-bottom:16px;margin-bottom:20px">
    <h2 style="color:#1d4ed8;margin:0;font-size:20px;letter-spacing:-0.5px">FFA FINSERV</h2>
    <p style="color:#64748b;font-size:12px;margin:4px 0 0;font-weight:600;text-transform:uppercase">Financial Assistance Services</p>
  </div>
  
  <p style="font-size:15px;line-height:1.6;margin:0 0 16px">Dear <b>${esc(o.customerName || "Customer")}</b>,</p>
  <p style="font-size:15px;line-height:1.6;margin:0 0 16px">Thank you for submitting your application for <b>${esc(o.product)}</b> with FFA Finserv.<br>Your application details have been registered in our system.</p>
  
  <div style="background:#eff6ff;border:1px solid #bfdbfe;border-radius:8px;padding:16px;margin:20px 0;text-align:center">
    <span style="font-size:12px;color:#1e40af;font-weight:600;text-transform:uppercase;letter-spacing:0.5px">Application Reference</span>
    <div style="font-size:20px;font-weight:bold;color:#1d4ed8;margin-top:4px;letter-spacing:1px">${esc(o.receipt)}</div>
  </div>

  <table style="width:100%;border-collapse:collapse;font-size:13px;margin:16px 0;border-top:1px solid #f1f5f9;border-bottom:1px solid #f1f5f9">
    <tr><td style="padding:8px 0;color:#64748b">Service</td><td style="padding:8px 0;text-align:right;font-weight:600;color:#0f172a">${esc(o.product)}</td></tr>
    <tr><td style="padding:8px 0;color:#64748b">Service Fee</td><td style="padding:8px 0;text-align:right;font-weight:600;color:#0f172a">₹${rupees}</td></tr>
    <tr><td style="padding:8px 0;color:#64748b">Mobile Number</td><td style="padding:8px 0;text-align:right;font-weight:600;color:#0f172a">${esc(o.customerMobile || "—")}</td></tr>
    <tr><td style="padding:8px 0;color:#64748b">Date Submitted</td><td style="padding:8px 0;text-align:right;font-weight:600;color:#0f172a">${esc(date)}</td></tr>
  </table>

  <div style="background:#f8fafc;border-left:4px solid #2563eb;border-radius:4px;padding:14px 16px;margin:20px 0">
    <h4 style="margin:0 0 6px;color:#0f172a;font-size:14px">Next Steps</h4>
    <p style="margin:0;font-size:14px;color:#475569;line-height:1.5">Please ensure the onboarding payment has been completed. Upon payment verification, our team will review your application details and contact you within <b>72 hours</b>.</p>
  </div>

  <p style="font-size:14px;color:#475569;line-height:1.6;margin:16px 0">Please retain your application reference number for any assistance.</p>

  <p style="font-size:14px;color:#334155;margin:24px 0 0;line-height:1.6">
    Regards,<br>
    <b>Team FFA Finserv</b>
  </p>
</div>`;

  const info = await transporter.sendMail({
    from: process.env.MAIL_FROM,
    to: recipient.value,
    replyTo: support,
    subject,
    text,
    html,
  });

  verifySmtpAccepted(info, recipient.value!);
  return { messageId: info.messageId };
}

/**
 * 4. Admin New Registration Alert Email
 * Sent dynamically upon customer registration save to notify the admin team.
 */
export async function sendAdminNewRegistrationEmail(o: PaymentOrder, overrideAdminEmail?: string): Promise<{ messageId: string }> {
  const adminEmail = overrideAdminEmail
    ? validateEmail(overrideAdminEmail).value
    : await getAdminNotificationEmail();
  if (!adminEmail || !validateEmail(adminEmail).valid) {
    throw new Error("Configured admin notification email is missing or invalid.");
  }
  const rupees = (o.amount / 100).toFixed(2);
  const date = (o.createdAt ?? new Date()).toLocaleString("en-IN", { timeZone: "Asia/Kolkata" });
  const subject = `[New Registration] ${o.receipt} - ${o.customerName || "Customer"}`;

  const transporter = createTransporter();

  const text = `FFA Finserv Admin Alert - New Registration

A new customer application has been submitted.

Order Reference: ${o.receipt}
Service: ${o.product}
Service Fee: ₹${rupees}
Registration Date: ${date}

Customer Details:
Full Name: ${o.customerName || "—"}
Email ID: ${o.customerEmail || "—"}
Mobile: ${o.customerMobile || "—"}
Date of Birth: ${o.customerDob || "—"}
Aadhaar Consent: ${o.consentGiven ? "Agreed" : "No"}

Status: Registration saved. Awaiting payment capture.`;

  const html = `<div style="font-family:Arial,sans-serif;max-width:560px;margin:auto;border:1px solid #e2e8f0;border-radius:12px;padding:28px;background:#ffffff;color:#1e293b">
  <div style="border-bottom:2px solid #2563eb;padding-bottom:14px;margin-bottom:20px">
    <span style="background:#dbeafe;color:#1d4ed8;font-size:11px;font-weight:700;padding:4px 8px;border-radius:4px;text-transform:uppercase;letter-spacing:0.5px">New Customer Registration</span>
    <h2 style="color:#0f172a;margin:8px 0 0;font-size:20px">${esc(o.customerName || "Customer")}</h2>
  </div>

  <table style="width:100%;border-collapse:collapse;font-size:13px;margin:16px 0">
    <tr><td style="padding:6px 0;color:#64748b">Application Reference</td><td style="padding:6px 0;text-align:right;font-weight:bold;color:#1d4ed8">${esc(o.receipt)}</td></tr>
    <tr><td style="padding:6px 0;color:#64748b">Service</td><td style="padding:6px 0;text-align:right;font-weight:600;color:#0f172a">${esc(o.product)}</td></tr>
    <tr><td style="padding:6px 0;color:#64748b">Fee</td><td style="padding:6px 0;text-align:right;font-weight:600;color:#0f172a">₹${rupees}</td></tr>
    <tr><td style="padding:6px 0;color:#64748b">Registration Date</td><td style="padding:6px 0;text-align:right;color:#0f172a">${esc(date)}</td></tr>
  </table>

  <h4 style="margin:20px 0 8px;color:#0f172a;font-size:14px;border-bottom:1px solid #f1f5f9;padding-bottom:6px">Customer Submitted Details</h4>
  <table style="width:100%;border-collapse:collapse;font-size:13px">
    <tr><td style="padding:6px 0;color:#64748b">Full Name</td><td style="padding:6px 0;text-align:right;font-weight:600;color:#0f172a">${esc(o.customerName || "—")}</td></tr>
    <tr><td style="padding:6px 0;color:#64748b">Email ID</td><td style="padding:6px 0;text-align:right;font-weight:600;color:#0f172a">${esc(o.customerEmail || "—")}</td></tr>
    <tr><td style="padding:6px 0;color:#64748b">Mobile Number</td><td style="padding:6px 0;text-align:right;font-weight:600;color:#0f172a">${esc(o.customerMobile || "—")}</td></tr>
    <tr><td style="padding:6px 0;color:#64748b">Date of Birth</td><td style="padding:6px 0;text-align:right;color:#0f172a">${esc(o.customerDob || "—")}</td></tr>
    <tr><td style="padding:6px 0;color:#64748b">Consent Given</td><td style="padding:6px 0;text-align:right;color:#16a34a;font-weight:600">${o.consentGiven ? "Agreed &amp; Verified" : "No"}</td></tr>
  </table>

  <div style="background:#f8fafc;border:1px solid #e2e8f0;border-radius:6px;padding:12px;margin:20px 0;font-size:13px;color:#475569">
    Application registered. Payment status will update automatically upon Razorpay payment capture.
  </div>
</div>`;

  const info = await transporter.sendMail({
    from: process.env.MAIL_FROM,
    to: adminEmail,
    subject,
    text,
    html,
  });

  verifySmtpAccepted(info, adminEmail);
  return { messageId: info.messageId };
}

/**
 * 5. Customer review-outcome emails (approved / rejected / more information requested).
 * Sent only after an admin explicitly completes a review action. The admin's message to the customer
 * is stored in PaymentOrder.teamResponseNotes and is HTML-escaped here.
 */
export async function sendReviewOutcomeEmail(
  kind: "REVIEW_APPROVED" | "REVIEW_REJECTED" | "REVIEW_INFO_REQUESTED",
  o: PaymentOrder,
  recipientEmail = o.customerEmail ?? "",
): Promise<{ messageId: string }> {
  const recipient = validateEmail(recipientEmail);
  if (!recipient.valid) throw new Error("Customer email address on order is missing or invalid.");
  const support = process.env.SUPPORT_EMAIL ?? process.env.MAIL_FROM ?? "support@ffafinserv.com";
  const note = (o.teamResponseNotes ?? "").trim();

  const copy = {
    REVIEW_APPROVED: {
      subject: `Your application has been approved – ${o.receipt}`,
      headline: "Your application has been approved",
      body: "Our team has completed the review of your application and it has been approved.",
      noteTitle: "Message from our team",
    },
    REVIEW_REJECTED: {
      subject: `Update on your application – ${o.receipt}`,
      headline: "We are unable to approve your application",
      body: "Our team has completed the review of your application and we are unable to approve it at this time.",
      noteTitle: "Reason",
    },
    REVIEW_INFO_REQUESTED: {
      subject: `Additional information needed – ${o.receipt}`,
      headline: "We need a little more information",
      body: "Our team is reviewing your application and needs some additional information before it can proceed.",
      noteTitle: "What we need",
    },
  }[kind];
  const closing = kind === "REVIEW_INFO_REQUESTED"
    ? `Please reply to this email or contact us at ${support} and quote your order reference.`
    : `If you have any questions, contact us at ${support} and quote your order reference.`;

  const text = `Dear Customer,\n\n${copy.body}\n\n${note ? `${copy.noteTitle}:\n${note}\n\n` : ""}Order Reference: ${o.receipt}\n\n${closing}\n\nRegards,\nTeam FFA Finserv`;
  const noteHtml = note
    ? `<div style="background:#f8fafc;border-left:4px solid #2563eb;border-radius:4px;padding:14px 16px;margin:20px 0"><h4 style="margin:0 0 6px;color:#0f172a;font-size:14px">${copy.noteTitle}</h4><p style="margin:0;font-size:14px;color:#475569;line-height:1.5">${esc(note).replace(/\r?\n/g, "<br>")}</p></div>`
    : "";
  const html = `<div style="font-family:Arial,sans-serif;max-width:540px;margin:auto;border:1px solid #e2e8f0;border-radius:12px;padding:28px;background:#ffffff;color:#1e293b">
  <div style="border-bottom:2px solid #2563eb;padding-bottom:16px;margin-bottom:20px">
    <h2 style="color:#1d4ed8;margin:0;font-size:20px;letter-spacing:-0.5px">FFA FINSERV</h2>
  </div>
  <h3 style="margin:0 0 12px;font-size:17px;color:#0f172a">${copy.headline}</h3>
  <p style="font-size:15px;line-height:1.6;margin:0 0 16px">Dear Customer,</p>
  <p style="font-size:15px;line-height:1.6;margin:0 0 16px">${copy.body}</p>
  ${noteHtml}
  <div style="background:#eff6ff;border:1px solid #bfdbfe;border-radius:8px;padding:16px;margin:20px 0;text-align:center">
    <span style="font-size:12px;color:#1e40af;font-weight:600;text-transform:uppercase;letter-spacing:0.5px">Order Reference</span>
    <div style="font-size:20px;font-weight:bold;color:#1d4ed8;margin-top:4px;letter-spacing:1px">${esc(o.receipt)}</div>
  </div>
  <p style="font-size:14px;color:#475569;line-height:1.6;margin:16px 0">${esc(closing)}</p>
  <p style="font-size:14px;color:#334155;margin:24px 0 0;line-height:1.6">Regards,<br><b>Team FFA Finserv</b></p>
</div>`;

  const info = await createTransporter().sendMail({
    from: process.env.MAIL_FROM,
    to: recipient.value,
    replyTo: support,
    subject: copy.subject,
    text,
    html,
  });
  verifySmtpAccepted(info, recipient.value!);
  return { messageId: info.messageId };
}
