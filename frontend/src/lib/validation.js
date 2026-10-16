/**
 * Registration-form validation (pure functions, no React) so the rules can be unit-tested.
 * The server remains the source of truth; these rules give the customer fast, specific feedback
 * and are intentionally no stricter than what a real person could legitimately enter.
 */

export const LIMITS = { name: 120, email: 190, mobile: 20 };

/* ---------- Name ---------- */

// Unicode letters + combining marks, with space . ' ’ - as separators (e.g. "Anne-Marie O’Neil", "K. Ramesh", "अनिल").
const NAME_CHARS = /^[\p{L}\p{M}][\p{L}\p{M} .'’-]*$/u;

/** Trim and collapse repeated whitespace. */
export const normalizeName = (v) => String(v ?? "").replace(/\s+/g, " ").trim();

export function validateName(value) {
  const name = normalizeName(value);
  if (!name) return "Enter your full name.";
  const letters = (name.match(/[\p{L}]/gu) || []).length;
  if (letters < 2) return "Enter your full name (at least 2 letters).";
  if (name.length > LIMITS.name) return `Name must be ${LIMITS.name} characters or fewer.`;
  if (/\d/.test(name)) return "Name cannot contain numbers.";
  if (!NAME_CHARS.test(name)) return "Name can only contain letters, spaces, and . ' -";
  return "";
}

/* ---------- Email ---------- */

export const normalizeEmail = (v) => String(v ?? "").trim();

const EMAIL_LOCAL = /^[A-Za-z0-9!#$%&'*+/=?^_`{|}~-]+(?:\.[A-Za-z0-9!#$%&'*+/=?^_`{|}~-]+)*$/; // no leading/trailing/double dots
const EMAIL_LABEL = /^[A-Za-z0-9](?:[A-Za-z0-9-]{0,61}[A-Za-z0-9])?$/;

export function validateEmail(value) {
  const email = normalizeEmail(value);
  if (!email) return "Enter your email address.";
  if (email.length > LIMITS.email) return `Email must be ${LIMITS.email} characters or fewer.`;
  if (/\s/.test(email)) return "Email address cannot contain spaces.";
  const parts = email.split("@");
  if (parts.length !== 2 || !parts[0] || !parts[1]) return "Enter a valid email address, like name@example.com.";
  const [local, domain] = parts;
  if (local.length > 64 || !EMAIL_LOCAL.test(local)) return "Enter a valid email address, like name@example.com.";
  const labels = domain.split(".");
  if (labels.length < 2 || !labels.every((l) => EMAIL_LABEL.test(l))) return "Enter a valid email address, like name@example.com.";
  if (!/^[A-Za-z]{2,}$/.test(labels[labels.length - 1])) return "Enter a valid email address, like name@example.com.";
  return "";
}

/* ---------- Mobile ---------- */

/** Keep only characters a phone number can contain while typing/pasting. */
export const sanitizeMobileInput = (v) => String(v ?? "").replace(/[^\d+\s()-]/g, "");

/**
 * Parses a phone number. Indian mobiles (the default market) are accepted as
 * 9876543210, 09876543210, 919876543210, +91 98765 43210, (+91) 98765-43210 and normalised to "+91XXXXXXXXXX".
 * Other countries are accepted only with an explicit "+" and 8–15 digits (E.164 maximum).
 * Returns { value, error }.
 */
export function parseMobile(raw) {
  const text = String(raw ?? "").trim();
  if (!text) return { value: "", error: "Enter your mobile number." };
  if (/[^\d+\s()-]/.test(text)) return { value: "", error: "Mobile number can only contain digits, spaces, + ( ) and -." };
  const compact = text.replace(/[\s()-]/g, ""); // "(+91) 98765-43210" -> "+919876543210"
  const hasPlus = compact.startsWith("+");
  if (compact.slice(1).includes("+")) return { value: "", error: "The + sign is only allowed at the start of the number." };
  const digits = compact.replace(/\D/g, "");

  const indian = (national) =>
    /^[6-9]\d{9}$/.test(national)
      ? { value: `+91${national}`, error: "" }
      : { value: "", error: "Enter a valid 10-digit Indian mobile number starting with 6, 7, 8 or 9." };

  if (hasPlus) {
    if (digits.startsWith("91")) return indian(digits.slice(2));
    if (digits.length < 8 || digits.length > 15) return { value: "", error: "Enter a valid international number (8 to 15 digits after +)." };
    if (digits.startsWith("0")) return { value: "", error: "A country code cannot start with 0." };
    return { value: `+${digits}`, error: "" };
  }
  if (digits.length === 10) return indian(digits);
  if (digits.length === 11 && digits.startsWith("0")) return indian(digits.slice(1));
  if (digits.length === 12 && digits.startsWith("91")) return indian(digits.slice(2));
  if (digits.length < 10) return { value: "", error: "Mobile number is too short. Enter 10 digits." };
  return { value: "", error: "Enter a valid 10-digit mobile number (or start with + for another country)." };
}

export const validateMobile = (raw) => parseMobile(raw).error;

/* ---------- Consent ---------- */

export const validateConsent = (accepted) =>
  accepted ? "" : "You must read and accept the declaration and non-refundable service fee consent to proceed.";

/* ---------- Date of Birth ---------- */

export function validateDob(value) {
  const text = String(value ?? "").trim();
  if (!text) return "Enter your date of birth.";
  let day, month, year;
  if (/^\d{4}-\d{2}-\d{2}$/.test(text)) {
    const parts = text.split("-").map(Number);
    year = parts[0];
    month = parts[1];
    day = parts[2];
  } else if (/^\d{1,2}[\/\-]\d{1,2}[\/\-]\d{4}$/.test(trimmedText(text))) {
    const parts = trimmedText(text).split(/[\/\-]/).map(Number);
    day = parts[0];
    month = parts[1];
    year = parts[2];
  } else {
    return "Enter a valid date of birth in DD / MM / YYYY format.";
  }

  if (month < 1 || month > 12) return "Enter a valid month (01 to 12).";
  const maxDays = new Date(year, month, 0).getDate();
  if (day < 1 || day > maxDays) return `Enter a valid day (01 to ${maxDays} for this month).`;

  const birthDate = new Date(year, month - 1, day);
  const today = new Date();
  if (birthDate > today) return "Date of birth cannot be in the future.";

  let age = today.getFullYear() - year;
  const m = today.getMonth() - (month - 1);
  if (m < 0 || (m === 0 && today.getDate() < day)) {
    age--;
  }

  if (age < 18) return "Applicant must be at least 18 years of age to be eligible for loan assistance.";
  if (age > 100) return "Please enter a valid date of birth.";
  return "";
}

const trimmedText = (s) => String(s ?? "").trim();

/* ---------- Whole form ---------- */

export const FIELD_ORDER = ["name", "dob", "email", "mobile", "consent"];

/** Returns { errors: {field: message}, values: normalised values } — errors is empty when valid. */
export function validateRegistration({ name, dob, email, mobile, consent }) {
  const errors = {};
  const nameError = validateName(name);
  if (nameError) errors.name = nameError;
  if (dob !== undefined) {
    const dobError = validateDob(dob);
    if (dobError) errors.dob = dobError;
  }
  const emailError = validateEmail(email);
  if (emailError) errors.email = emailError;
  const m = parseMobile(mobile);
  if (m.error) errors.mobile = m.error;
  const consentError = validateConsent(consent);
  if (consentError) errors.consent = consentError;
  return {
    errors,
    values: {
      name: normalizeName(name),
      ...(dob !== undefined ? { dob: String(dob ?? "").trim() } : {}),
      email: normalizeEmail(email),
      mobile: m.value,
    },
  };
}
