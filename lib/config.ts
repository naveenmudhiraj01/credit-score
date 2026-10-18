export const BRAND =
  process.env.NEXT_PUBLIC_BRAND_NAME ||
  process.env.VITE_BRAND_NAME ||
  "FFA Finserv";

export const ADMIN_EMAIL =
  process.env.NEXT_PUBLIC_ADMIN_EMAIL ||
  process.env.VITE_ADMIN_EMAIL ||
  "admin@yourdomain.com";

export const SHEET_URL =
  process.env.NEXT_PUBLIC_GOOGLE_SHEET_URL ||
  process.env.VITE_GOOGLE_SHEET_URL ||
  "";

// Optional customer-support contact shown on the customer dashboard
export const SUPPORT_EMAIL =
  process.env.NEXT_PUBLIC_SUPPORT_EMAIL ||
  process.env.VITE_SUPPORT_EMAIL ||
  "";
