/**
 * Production-level Validation Module
 * Single source of truth for validation rules across customer onboarding,
 * payment flow, admin forms, and API requests.
 */

import { findProduct, MIN_SERVICE_FEE_PAISE, MAX_SERVICE_FEE_PAISE, type CatalogProduct } from "./catalog.ts";

export const RECEIPT_RE = /^ORD\w{6,40}$/;

export interface ValidationResult<T = string> {
  valid: boolean;
  error?: string;
  value?: T;
}

// ============================================================================
// 1. NAME VALIDATION
// ============================================================================

const CONTROL_CHARS_RE = /[\u0000-\u001F\u007F-\u009F]/;
const HTML_TAGS_RE = /<[^>]*>/;
const HAS_LETTER_RE = /\p{L}/u;

/**
 * Validates customer or administrator full name.
 * - Trims leading/trailing whitespace.
 * - Rejects empty/whitespace-only input.
 * - Enforces sensible length boundaries (2 to 120 characters, matching DB VarChar(120)).
 * - Rejects ASCII/Unicode control characters and HTML/script injection attempts.
 * - Rejects inputs devoid of letters (pure numbers or symbols like "12345" or "---").
 * - Does NOT blindly reject digits when accompanied by letters (e.g. "naveen2", "Henry VIII", "John 3rd").
 * - Fully supports non-English/international names (e.g. "राहुल शर्मा", "François", "José").
 */
export function validateName(raw: unknown): ValidationResult<string> {
  if (typeof raw !== "string") {
    return { valid: false, error: "Full name is required." };
  }

  const trimmed = raw.trim();

  if (trimmed.length === 0) {
    return { valid: false, error: "Full name cannot be empty." };
  }

  if (trimmed.length < 2) {
    return { valid: false, error: "Full name must be at least 2 characters long." };
  }

  if (trimmed.length > 120) {
    return { valid: false, error: "Full name cannot exceed 120 characters." };
  }

  if (CONTROL_CHARS_RE.test(trimmed)) {
    return { valid: false, error: "Full name contains illegal control characters." };
  }

  if (HTML_TAGS_RE.test(trimmed)) {
    return { valid: false, error: "Full name cannot contain HTML or script markup." };
  }

  if (!HAS_LETTER_RE.test(trimmed)) {
    return { valid: false, error: "Full name must contain at least one valid alphabetical letter." };
  }

  return { valid: true, value: trimmed };
}

// ============================================================================
// 2. EMAIL VALIDATION
// ============================================================================

/**
 * Recognizes all standard 2-letter ISO country code TLDs (ccTLDs)
 * and popular/established generic top-level domains (gTLDs).
 */
const VALID_GTLDS = new Set([
  "com", "org", "net", "edu", "gov", "mil", "int", "info", "biz", "io", "ai",
  "app", "dev", "tech", "site", "online", "store", "xyz", "pro", "club", "shop",
  "cloud", "global", "agency", "center", "company", "digital", "group", "network",
  "solutions", "world", "media", "design", "expert", "guru", "life", "live",
  "today", "zone", "email", "host", "press", "space", "website", "co", "me",
  "tv", "cc", "name", "mobi", "asia", "travel", "jobs", "tel", "post", "top",
  "vip", "icu", "link", "art", "work", "news", "bank", "law", "ngo", "ong",
]);

/**
 * Validates email address syntax and domain structure.
 * Note: Syntax validation verifies structure and RFC compliance, but does NOT prove
 * that the remote mailbox currently exists or is deliverable. Real delivery status
 * is tracked via email delivery states (PENDING, SENDING, SENT, FAILED).
 */
export function validateEmail(raw: unknown): ValidationResult<string> {
  if (typeof raw !== "string") {
    return { valid: false, error: "Email address is required." };
  }

  const trimmed = raw.trim().toLowerCase();

  if (trimmed.length === 0) {
    return { valid: false, error: "Email address cannot be empty." };
  }

  if (trimmed.length > 190) {
    return { valid: false, error: "Email address cannot exceed 190 characters." };
  }

  // Check for exactly one '@' symbol
  const atIndex = trimmed.indexOf("@");
  if (atIndex === -1 || atIndex !== trimmed.lastIndexOf("@")) {
    return { valid: false, error: "Email must contain exactly one '@' symbol." };
  }

  const localPart = trimmed.slice(0, atIndex);
  const domainPart = trimmed.slice(atIndex + 1);

  // Validate Local Part
  if (!localPart || localPart.length > 64) {
    return { valid: false, error: "Email username portion must be between 1 and 64 characters." };
  }

  if (localPart.startsWith(".") || localPart.endsWith(".")) {
    return { valid: false, error: "Email username cannot start or end with a dot." };
  }

  if (localPart.includes("..")) {
    return { valid: false, error: "Email username cannot contain consecutive dots." };
  }

  // RFC 5322 local-part allowed characters
  const LOCAL_RE = /^[a-zA-Z0-9.!#$%&'*+/=?^_`{|}~-]+$/;
  if (!LOCAL_RE.test(localPart)) {
    return { valid: false, error: "Email username contains invalid characters." };
  }

  // Validate Domain Part
  if (!domainPart || domainPart.length > 253) {
    return { valid: false, error: "Email domain must be between 1 and 253 characters." };
  }

  if (domainPart.startsWith(".") || domainPart.endsWith(".")) {
    return { valid: false, error: "Email domain cannot start or end with a dot." };
  }

  if (domainPart.includes("..")) {
    return { valid: false, error: "Email domain cannot contain consecutive dots." };
  }

  const labels = domainPart.split(".");
  if (labels.length < 2) {
    return { valid: false, error: "Email domain must include a valid top-level domain (e.g. .com, .in)." };
  }

  const DOMAIN_LABEL_RE = /^[a-zA-Z0-9]([a-zA-Z0-9-]*[a-zA-Z0-9])?$/;
  for (const label of labels) {
    if (label.length === 0 || label.length > 63) {
      return { valid: false, error: "Email domain label must be between 1 and 63 characters." };
    }
    if (!DOMAIN_LABEL_RE.test(label)) {
      return { valid: false, error: `Email domain label '${label}' contains invalid characters or formatting.` };
    }
  }

  // Top-Level Domain (TLD) validation
  const tld = labels[labels.length - 1];
  if (!/^[a-zA-Z]+$/.test(tld)) {
    return { valid: false, error: "Email top-level domain must contain only letters." };
  }

  if (tld.length < 2) {
    return { valid: false, error: "Email top-level domain is too short." };
  }

  // Verify against valid 2-letter country code or recognized gTLD
  const is2LetterCcTLD = tld.length === 2;
  const isKnownGTLD = VALID_GTLDS.has(tld);

  if (!is2LetterCcTLD && !isKnownGTLD) {
    return {
      valid: false,
      error: `Email domain has an invalid or unrecognized top-level domain ('.${tld}').`,
    };
  }

  return { valid: true, value: trimmed };
}

// ============================================================================
// 3. PHONE NUMBER VALIDATION
// ============================================================================

/**
 * Validates and normalizes phone numbers.
 * The primary application market is India (INR currency, credit score verification).
 * - Supported formats:
 *   - 10 digits starting with [6-9]: "9876543210"
 *   - +91 with 10 digits starting with [6-9]: "+919876543210"
 *   - 0-prefixed 11 digits: "09876543210"
 *   - 91-prefixed 12 digits: "919876543210"
 * - Normalizes to E.164: "+91XXXXXXXXXX"
 * - Rejects impossible Indian mobile prefixes (e.g. numbers starting with 0-5).
 * - Rejects repetitive mock numbers (e.g. "0000000000", "9999999999").
 * - Valid international E.164 formats (+[1-9]\d{7,14}) are accepted if international.
 * Note: Format validation does not guarantee customer ownership without SMS OTP verification.
 */
export function validatePhone(raw: unknown): ValidationResult<string> {
  if (typeof raw !== "string") {
    return { valid: false, error: "Phone number is required." };
  }

  const cleaned = raw.trim().replace(/[\s\-().]/g, "");

  if (cleaned.length === 0) {
    return { valid: false, error: "Phone number cannot be empty." };
  }

  // Indian mobile formats
  let indianDigits: string | null = null;

  if (cleaned.startsWith("+91")) {
    if (/^\+91[6-9]\d{9}$/.test(cleaned)) {
      indianDigits = cleaned.slice(3);
    }
  } else if (cleaned.startsWith("+")) {
    // International number (non-Indian)
    if (/^\+[1-9]\d{7,14}$/.test(cleaned)) {
      return { valid: true, value: cleaned };
    }
    return {
      valid: false,
      error: "Invalid international phone number format (must follow E.164 format, e.g. +14155552671).",
    };
  } else if (/^91[6-9]\d{9}$/.test(cleaned)) {
    indianDigits = cleaned.slice(2);
  } else if (/^0[6-9]\d{9}$/.test(cleaned)) {
    indianDigits = cleaned.slice(1);
  } else if (/^[6-9]\d{9}$/.test(cleaned)) {
    indianDigits = cleaned;
  }

  if (indianDigits) {
    // Reject all identical digits
    if (/^(\d)\1{9}$/.test(indianDigits)) {
      return { valid: false, error: "Phone number cannot consist of repeating digits." };
    }
    return { valid: true, value: `+91${indianDigits}` };
  }

  // Check for impossible Indian prefixes or lengths for domestic numbers
  if (cleaned.length === 10 && !/^[6-9]/.test(cleaned)) {
    return {
      valid: false,
      error: `Invalid Indian mobile number: must start with 6, 7, 8, or 9 (starts with '${cleaned[0]}').`,
    };
  }

  if (cleaned.length === 11 && !cleaned.startsWith("0")) {
    return { valid: false, error: "Invalid phone number length (11 digits without 0 trunk prefix)." };
  }

  if (cleaned.length === 12 && !cleaned.startsWith("91")) {
    return { valid: false, error: "Invalid phone number length or unsupported international prefix." };
  }

  return {
    valid: false,
    error: "Please enter a valid 10-digit Indian mobile number (e.g. 9876543210 or +91 9876543210).",
  };
}

// ============================================================================
// 3.5. DATE OF BIRTH VALIDATION
// ============================================================================

/**
 * Validates Date of Birth and enforces minimum age eligibility (18+ years).
 * Accepts DD/MM/YYYY, DD-MM-YYYY, or YYYY-MM-DD.
 * Rejects invalid dates (e.g. 31st Feb), future dates, or applicants under 18.
 * Returns normalized string in DD/MM/YYYY format.
 */
export function validateDob(raw: unknown): ValidationResult<string> {
  if (typeof raw !== "string" || !raw.trim()) {
    return { valid: false, error: "Date of birth is required." };
  }

  const trimmed = raw.trim();
  let day: number;
  let month: number;
  let year: number;

  if (/^\d{4}-\d{2}-\d{2}$/.test(trimmed)) {
    const parts = trimmed.split("-").map(Number);
    year = parts[0];
    month = parts[1];
    day = parts[2];
  } else if (/^\d{1,2}[\/\-]\d{1,2}[\/\-]\d{4}$/.test(trimmed)) {
    const parts = trimmed.split(/[\/\-]/).map(Number);
    day = parts[0];
    month = parts[1];
    year = parts[2];
  } else {
    return { valid: false, error: "Please enter a valid date of birth in DD/MM/YYYY format." };
  }

  if (month < 1 || month > 12) {
    return { valid: false, error: "Invalid month in date of birth." };
  }

  // Days in month validation (accounts for leap years)
  const maxDays = new Date(year, month, 0).getDate();
  if (day < 1 || day > maxDays) {
    return { valid: false, error: `Invalid day for the specified month (expected 1 to ${maxDays}).` };
  }

  const birthDate = new Date(year, month - 1, day);
  const today = new Date();

  if (birthDate > today) {
    return { valid: false, error: "Date of birth cannot be in the future." };
  }

  // Exact age calculation
  let age = today.getFullYear() - year;
  const m = today.getMonth() - (month - 1);
  if (m < 0 || (m === 0 && today.getDate() < day)) {
    age--;
  }

  if (age < 18) {
    return { valid: false, error: "Applicant must be at least 18 years of age to be eligible for loan assistance." };
  }

  if (age > 100) {
    return { valid: false, error: "Please enter a valid date of birth (age cannot exceed 100 years)." };
  }

  const formattedDay = String(day).padStart(2, "0");
  const formattedMonth = String(month).padStart(2, "0");
  return { valid: true, value: `${formattedDay}/${formattedMonth}/${year}` };
}

// ============================================================================
// 4. PRODUCT ID VALIDATION
// ============================================================================

export function validateProductId(raw: unknown): ValidationResult<CatalogProduct> {
  if (typeof raw !== "string" || !raw.trim()) {
    return { valid: false, error: "Product selection is required." };
  }

  const product = findProduct(raw.trim());
  if (!product) {
    return { valid: false, error: `Invalid product ID '${raw}'. Product does not exist in catalog.` };
  }

  return { valid: true, value: product };
}

// ============================================================================
// 5. RECEIPT / ORDER ID VALIDATION
// ============================================================================

export function validateReceipt(raw: unknown): ValidationResult<string> {
  if (typeof raw !== "string" || !raw.trim()) {
    return { valid: false, error: "Order number is required." };
  }

  const trimmed = raw.trim();
  if (!RECEIPT_RE.test(trimmed)) {
    return { valid: false, error: "Invalid order number format (expected ORD...)." };
  }

  return { valid: true, value: trimmed };
}

// ============================================================================
// 6. SERVICE FEE / AMOUNT VALIDATION
// ============================================================================

export function validateFeePaise(raw: unknown): ValidationResult<number> {
  if (typeof raw !== "number" || !Number.isSafeInteger(raw)) {
    return { valid: false, error: "Fee must be a valid integer in paise." };
  }

  if (raw < MIN_SERVICE_FEE_PAISE) {
    return { valid: false, error: `Fee cannot be less than ₹${MIN_SERVICE_FEE_PAISE / 100} (${MIN_SERVICE_FEE_PAISE} paise).` };
  }

  if (raw > MAX_SERVICE_FEE_PAISE) {
    return { valid: false, error: `Fee cannot exceed ₹${MAX_SERVICE_FEE_PAISE / 100} (${MAX_SERVICE_FEE_PAISE} paise).` };
  }

  return { valid: true, value: raw };
}

// ============================================================================
// 7. COMPOSITE ORDER CREATION PAYLOAD VALIDATION
// ============================================================================

export interface OrderCreationInput {
  orderId?: string;
  productId?: string;
  name?: string;
  dob?: string;
  dateOfBirth?: string;
  email?: string;
  mobile?: string;
  consent?: boolean;
  consentGiven?: boolean;
  consentText?: string;
  consentVersion?: string;
}

export interface ValidatedOrderPayload {
  orderRef?: string;
  productId?: string;
  name?: string;
  dob?: string;
  email?: string;
  mobile?: string;
  consentGiven: boolean;
}

export function validateCreateOrderRequest(body: Record<string, unknown>): {
  ok: boolean;
  statusCode?: number;
  errorCode?: string;
  errorMessage?: string;
  data?: ValidatedOrderPayload;
} {
  const orderIdRaw = body.orderId;
  const isRetry = typeof orderIdRaw === "string" && orderIdRaw.trim().length > 0;

  if (isRetry) {
    const receiptRes = validateReceipt(orderIdRaw);
    if (!receiptRes.valid) {
      return {
        ok: false,
        statusCode: 400,
        errorCode: "INVALID_ORDER",
        errorMessage: receiptRes.error,
      };
    }
    return {
      ok: true,
      data: {
        orderRef: receiptRes.value,
        consentGiven: true,
      },
    };
  }

  // Validate product
  const prodRes = validateProductId(body.productId);
  if (!prodRes.valid) {
    return {
      ok: false,
      statusCode: 400,
      errorCode: "INVALID_PRODUCT",
      errorMessage: prodRes.error,
    };
  }

  // Validate Name
  const nameRes = validateName(body.name);
  if (!nameRes.valid) {
    return {
      ok: false,
      statusCode: 400,
      errorCode: "INVALID_NAME",
      errorMessage: nameRes.error,
    };
  }

  // Validate Date of Birth (when provided)
  let validatedDob: string | undefined = undefined;
  const rawDob = body.dob ?? body.dateOfBirth;
  if (rawDob !== undefined && rawDob !== null && rawDob !== "") {
    const dobRes = validateDob(rawDob);
    if (!dobRes.valid) {
      return {
        ok: false,
        statusCode: 400,
        errorCode: "INVALID_DOB",
        errorMessage: dobRes.error,
      };
    }
    validatedDob = dobRes.value;
  }

  // Validate Email
  const emailRes = validateEmail(body.email);
  if (!emailRes.valid) {
    return {
      ok: false,
      statusCode: 400,
      errorCode: "INVALID_EMAIL",
      errorMessage: emailRes.error,
    };
  }

  // Validate Phone
  const phoneRes = validatePhone(body.mobile);
  if (!phoneRes.valid) {
    return {
      ok: false,
      statusCode: 400,
      errorCode: "INVALID_MOBILE",
      errorMessage: phoneRes.error,
    };
  }

  // Validate Consent (Preserve 422 CONSENT_REQUIRED for sandbox verification compatibility)
  const consentPassed = body.consent === true || body.consentGiven === true;
  if (!consentPassed) {
    return {
      ok: false,
      statusCode: 422,
      errorCode: "CONSENT_REQUIRED",
      errorMessage: "Mandatory declaration and non-refundable service fee consent must be accepted to proceed.",
    };
  }

  return {
    ok: true,
    data: {
      productId: prodRes.value!.id,
      name: nameRes.value,
      dob: validatedDob,
      email: emailRes.value,
      mobile: phoneRes.value,
      consentGiven: true,
    },
  };
}
