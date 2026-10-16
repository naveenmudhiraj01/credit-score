"use client";

import { useState, useEffect, useRef } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";

import { validateName, validateEmail, validatePhone, validateDob } from "@/lib/validation";

declare global {
  interface Window {
    Razorpay?: any;
  }
}

interface OrderData {
  orderId: string;
  razorpayOrderId: string;
  amount: number;
  currency: string;
  product: string;
  keyId?: string;
}

export default function RegisterPage() {
  const router = useRouter();

  const [step, setStep] = useState<"form" | "payment">("form");
  const [formData, setFormData] = useState({
    name: "",
    dob: "",
    email: "",
    mobile: "",
  });

  const [errors, setErrors] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const [consentAccepted, setConsentAccepted] = useState(false);
  const [termsOpen, setTermsOpen] = useState(false);
  const [duplicateWarning, setDuplicateWarning] = useState<string | null>(null);
  const [orderData, setOrderData] = useState<OrderData | null>(null);
  const termsDialogRef = useRef<HTMLDialogElement>(null);
  const termsLinkRef = useRef<HTMLAnchorElement>(null);
  const termsCloseRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    const dialog = termsDialogRef.current;
    if (!dialog) return;

    if (termsOpen) {
      const previousBodyOverflow = document.body.style.overflow;
      const handleEscape = (event: KeyboardEvent) => {
        if (event.key === "Escape") {
          event.preventDefault();
          setTermsOpen(false);
        }
      };

      if (!dialog.open) dialog.showModal();
      document.body.style.overflow = "hidden";
      document.addEventListener("keydown", handleEscape, true);
      termsCloseRef.current?.focus();

      return () => {
        document.removeEventListener("keydown", handleEscape, true);
        document.body.style.overflow = previousBodyOverflow;
        if (dialog.open) dialog.close();
        termsLinkRef.current?.focus();
      };
    }

    if (dialog.open) dialog.close();
  }, [termsOpen]);

  // Field blurs for instant inline feedback
  const handleNameBlur = () => {
    if (!formData.name) return;
    const res = validateName(formData.name);
    setErrors((prev) => ({ ...prev, name: res.valid ? "" : res.error! }));
  };

  const handleDobBlur = () => {
    if (!formData.dob) return;
    const res = validateDob(formData.dob);
    setErrors((prev) => ({ ...prev, dob: res.valid ? "" : res.error! }));
  };

  const handleMobileBlur = () => {
    if (!formData.mobile) return;
    const res = validatePhone(formData.mobile);
    setErrors((prev) => ({ ...prev, mobile: res.valid ? "" : res.error! }));
  };

  const handleEmailBlur = async () => {
    const raw = formData.email.trim();
    if (!raw) return;
    const emailRes = validateEmail(raw);
    if (!emailRes.valid) {
      setErrors((prev) => ({ ...prev, email: emailRes.error! }));
      setDuplicateWarning(null);
      return;
    }
    setErrors((prev) => ({ ...prev, email: "" }));
    try {
      const res = await fetch(`/api/customers/check-email?email=${encodeURIComponent(emailRes.value!)}`);
      const data = await res.json();
      if (data.exists) {
        setDuplicateWarning(data.warning || "An application with this email already exists in our system. You are submitting a new application.");
      } else {
        setDuplicateWarning(null);
      }
    } catch {
      // non-blocking
    }
  };

  const validate = (): {
    valid: boolean;
    values?: { name: string; dob: string; email: string; mobile: string };
  } => {
    const errs: Record<string, string> = {};

    const nameRes = validateName(formData.name);
    if (!nameRes.valid) errs.name = nameRes.error!;

    const dobRes = validateDob(formData.dob);
    if (!dobRes.valid) errs.dob = dobRes.error!;

    const emailRes = validateEmail(formData.email);
    if (!emailRes.valid) errs.email = emailRes.error!;

    const phoneRes = validatePhone(formData.mobile);
    if (!phoneRes.valid) errs.mobile = phoneRes.error!;

    if (!consentAccepted) {
      errs.consent = "Please accept the Terms & Conditions and data privacy terms to continue.";
    }

    setErrors(errs);
    if (Object.keys(errs).length > 0) return { valid: false };

    return {
      valid: true,
      values: {
        name: nameRes.value!,
        dob: dobRes.value!,
        email: emailRes.value!,
        mobile: phoneRes.value!,
      },
    };
  };

  // Screen 2 Submission: Validates and prepares order for Screen 3
  const handleSaveAndApply = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMessage(null);

    const validation = validate();
    if (!validation.valid || !validation.values) return;

    setLoading(true);

    try {
      const res = await fetch("/api/payments/create", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          productId: "product-a",
          name: validation.values.name,
          dob: validation.values.dob,
          email: validation.values.email,
          mobile: validation.values.mobile,
          consentGiven: consentAccepted,
        }),
      });

      const data = await res.json();

      if (!res.ok) {
        throw new Error(data.error?.message || "Failed to initialize service order.");
      }

      setOrderData(data);
      setStep("payment");
      setLoading(false);
    } catch (err: any) {
      setErrorMessage(err.message || "An unexpected error occurred while saving your details.");
      setLoading(false);
    }
  };

  // Screen 3 Action: Proceed to Razorpay payment
  const handleProceedToPayment = () => {
    if (!orderData) return;
    setLoading(true);
    setErrorMessage(null);

    if (!window.Razorpay) {
      setErrorMessage("Razorpay payment gateway script is still loading. Please retry in a moment.");
      setLoading(false);
      return;
    }

    const options = {
      key: orderData.keyId || process.env.NEXT_PUBLIC_RAZORPAY_KEY_ID,
      amount: orderData.amount,
      currency: orderData.currency || "INR",
      name: "FFA Finserv",
      description: "Loan Assistance Service",
      order_id: orderData.razorpayOrderId,
      prefill: {
        name: formData.name,
        email: formData.email,
        contact: formData.mobile,
      },
      theme: {
        color: "#2563eb",
      },
      handler: async (response: {
        razorpay_payment_id: string;
        razorpay_order_id: string;
        razorpay_signature: string;
      }) => {
        setLoading(true);
        try {
          const verifyRes = await fetch("/api/payments/verify", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              razorpay_order_id: response.razorpay_order_id,
              razorpay_payment_id: response.razorpay_payment_id,
              razorpay_signature: response.razorpay_signature,
            }),
          });

          const verifyData = await verifyRes.json();

          if (!verifyRes.ok) {
            throw new Error(verifyData.error?.message || "Payment verification failed.");
          }

          router.push(`/payment-success?order=${orderData.orderId}&paymentId=${response.razorpay_payment_id}`);
        } catch (verErr: any) {
          setErrorMessage(verErr.message || "Payment verification failed.");
          setLoading(false);
        }
      },
      modal: {
        ondismiss: () => {
          setLoading(false);
        },
      },
    };

    const rzp = new window.Razorpay(options);
    rzp.on("payment.failed", (resp: any) => {
      setErrorMessage(resp.error?.description || "Payment was not successful. You can retry anytime.");
      setLoading(false);
    });
    rzp.open();
  };

  return (
    <div className="container container-narrow" style={{ paddingTop: "2.5rem", paddingBottom: "3rem" }}>
      {/* Header Banner */}
      <div style={{ textAlign: "center", marginBottom: "2rem" }}>
        <div style={{ display: "inline-flex", alignItems: "center", gap: "0.5rem", background: "rgba(37, 99, 235, 0.08)", color: "var(--color-primary)", padding: "0.35rem 0.85rem", borderRadius: "9999px", fontSize: "0.75rem", fontWeight: 700, marginBottom: "0.75rem", textTransform: "uppercase", letterSpacing: "0.5px" }}>
          FFA FINSERV • {step === "form" ? "Step 1 of 2" : "Step 2 of 2"}
        </div>
        <h1 style={{ fontSize: "2rem", fontWeight: 800, color: "var(--text-primary)" }}>
          {step === "form" ? "Apply for Loan Assistance" : "Complete Your Payment"}
        </h1>
        <p style={{ color: "var(--text-secondary)", marginTop: "0.5rem", fontSize: "0.9375rem" }}>
          {step === "form"
            ? "Please enter your details accurately to proceed with your service request."
            : "Secure payment for FFA Finserv services"}
        </p>
      </div>

      <div className="card card-elevated" style={{ padding: "2.5rem" }}>
        {errorMessage && (
          <div style={{ background: "var(--color-danger-bg)", border: "1px solid var(--color-danger-border)", color: "var(--color-danger-text)", padding: "1rem", borderRadius: "var(--radius-md)", marginBottom: "1.5rem", fontSize: "0.875rem" }}>
            <strong>Notice:</strong> {errorMessage}
          </div>
        )}

        {/* =========================================================================
            SCREEN 2 — Customer Application Form
           ========================================================================= */}
        {step === "form" && (
          <form onSubmit={handleSaveAndApply}>
            {/* Field 1: Full Name */}
            <div className="form-group">
              <label className="form-label" htmlFor="fullName">
                1. Full Name as per Aadhaar <span className="form-label-required">*</span>
              </label>
              <input
                id="fullName"
                type="text"
                className={`form-input ${errors.name ? "error" : ""}`}
                placeholder="Enter your full name"
                value={formData.name}
                onChange={(e) => {
                  setFormData({ ...formData, name: e.target.value });
                  if (errors.name) setErrors((prev) => ({ ...prev, name: "" }));
                }}
                onBlur={handleNameBlur}
                disabled={loading}
              />
              {errors.name && <div className="form-error">{errors.name}</div>}
            </div>

            {/* Field 2: Date of Birth */}
            <div className="form-group">
              <label className="form-label" htmlFor="dob">
                2. Date of Birth <span className="form-label-required">*</span>
              </label>
              <input
                id="dob"
                type="text"
                className={`form-input ${errors.dob ? "error" : ""}`}
                placeholder="DD / MM / YYYY"
                maxLength={10}
                value={formData.dob}
                onChange={(e) => {
                  setFormData({ ...formData, dob: e.target.value });
                  if (errors.dob) setErrors((prev) => ({ ...prev, dob: "" }));
                }}
                onBlur={handleDobBlur}
                disabled={loading}
              />
              {errors.dob ? (
                <div className="form-error">{errors.dob}</div>
              ) : (
                <div className="form-hint">Enter your birth date in DD / MM / YYYY format (enforce 18+ eligibility).</div>
              )}
            </div>

            {/* Field 3: Email ID */}
            <div className="form-group">
              <label className="form-label" htmlFor="email">
                3. Email ID <span className="form-label-required">*</span>
              </label>
              <input
                id="email"
                type="email"
                className={`form-input ${errors.email ? "error" : ""}`}
                placeholder="Enter your email address"
                value={formData.email}
                onChange={(e) => {
                  setFormData({ ...formData, email: e.target.value });
                  if (errors.email) setErrors((prev) => ({ ...prev, email: "" }));
                }}
                onBlur={handleEmailBlur}
                disabled={loading}
              />
              {errors.email && <div className="form-error">{errors.email}</div>}
              {duplicateWarning && (
                <div style={{ marginTop: "0.5rem", padding: "0.625rem", borderRadius: "var(--radius-sm)", background: "#fffbeb", border: "1px solid #fef3c7", color: "#92400e", fontSize: "0.8125rem" }}>
                  ℹ️ {duplicateWarning}
                </div>
              )}
            </div>

            {/* Field 4: Mobile Number Linked to Aadhaar */}
            <div className="form-group">
              <label className="form-label" htmlFor="mobile">
                4. Mobile Number Linked to Aadhaar <span className="form-label-required">*</span>
              </label>
              <div style={{ display: "flex" }}>
                <span style={{ display: "inline-flex", alignItems: "center", padding: "0 0.875rem", background: "var(--bg-surface-muted)", border: "1px solid var(--border-subtle)", borderRight: "none", borderRadius: "var(--radius-md) 0 0 var(--radius-md)", fontSize: "0.875rem", fontWeight: 600, color: "var(--text-secondary)" }}>
                  +91
                </span>
                <input
                  id="mobile"
                  type="tel"
                  style={{ borderRadius: "0 var(--radius-md) var(--radius-md) 0" }}
                  className={`form-input ${errors.mobile ? "error" : ""}`}
                  placeholder="Enter 10-digit mobile number"
                  maxLength={10}
                  value={formData.mobile}
                  onChange={(e) => {
                    const digits = e.target.value.replace(/\D/g, "");
                    setFormData({ ...formData, mobile: digits });
                    if (errors.mobile) setErrors((prev) => ({ ...prev, mobile: "" }));
                  }}
                  onBlur={handleMobileBlur}
                  disabled={loading}
                />
              </div>
              {errors.mobile && <div className="form-error">{errors.mobile}</div>}
            </div>

            {/* Mandatory Fields Footnote */}
            <p style={{ fontSize: "0.75rem", color: "var(--text-muted)", marginBottom: "1.25rem" }}>
              * All fields are mandatory. The mobile number should be one the customer can access.
            </p>

            {/* Mandatory Consent Checkbox */}
            <div className={`terms-consent${errors.consent ? " terms-consent--error" : ""}`}>
              <div className="terms-consent__row">
                <input
                  id="terms-consent"
                  type="checkbox"
                  checked={consentAccepted}
                  aria-label="I agree to the Terms & Conditions and acknowledge the applicable data privacy terms."
                  onChange={(e) => {
                    setConsentAccepted(e.target.checked);
                    if (errors.consent) setErrors((prev) => ({ ...prev, consent: "" }));
                  }}
                  aria-invalid={Boolean(errors.consent)}
                  aria-describedby={errors.consent ? "terms-consent-error" : undefined}
                />
                <label htmlFor="terms-consent" className="terms-consent__label">
                  <span>I agree to the </span>
                  <a
                    ref={termsLinkRef}
                    className="terms-link"
                    href="#terms-and-conditions"
                    role="button"
                    tabIndex={0}
                    onClick={(event) => {
                      event.preventDefault();
                      event.stopPropagation();
                      setTermsOpen(true);
                    }}
                    onKeyDown={(event) => {
                      if (event.key === "Enter" || event.key === " ") {
                        event.preventDefault();
                        event.stopPropagation();
                        setTermsOpen(true);
                      }
                    }}
                  >
                    Terms &amp; Conditions
                  </a>
                  <span> and acknowledge the applicable data privacy terms.</span>
                </label>
              </div>
              {errors.consent && (
                <div id="terms-consent-error" className="form-error" role="alert">
                  {errors.consent}
                </div>
              )}
            </div>

            <button
              type="submit"
              className="btn btn-primary btn-lg btn-full"
              disabled={loading}
              style={{ fontWeight: 700, fontSize: "1rem" }}
            >
              {loading ? (
                <span style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: "0.5rem" }}>
                  <svg className="spin" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                    <circle cx="12" cy="12" r="10" strokeOpacity="0.25" stroke="currentColor" />
                    <path d="M12 2a10 10 0 0 1 10 10" />
                  </svg>
                  Saving Details...
                </span>
              ) : (
                "SAVE & APPLY"
              )}
            </button>
          </form>
        )}

        {/* =========================================================================
            SCREEN 3 — Payment Gateway (Complete Your Payment)
           ========================================================================= */}
        {step === "payment" && orderData && (
          <div>
            <div style={{ background: "var(--bg-surface-muted)", borderRadius: "var(--radius-md)", border: "1px solid var(--border-subtle)", overflow: "hidden", marginBottom: "1.5rem" }}>
              <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "0.875rem" }}>
                <tbody>
                  <tr style={{ borderBottom: "1px solid var(--border-subtle)" }}>
                    <td style={{ padding: "0.875rem 1.25rem", color: "var(--text-secondary)", fontWeight: 600 }}>Service</td>
                    <td style={{ padding: "0.875rem 1.25rem", textAlign: "right", fontWeight: 700, color: "var(--text-primary)" }}>
                      Loan Assistance Service
                    </td>
                  </tr>
                  <tr style={{ borderBottom: "1px solid var(--border-subtle)" }}>
                    <td style={{ padding: "0.875rem 1.25rem", color: "var(--text-secondary)", fontWeight: 600 }}>Service Fee</td>
                    <td style={{ padding: "0.875rem 1.25rem", textAlign: "right", fontWeight: 800, color: "var(--color-primary)", fontSize: "1.125rem" }}>
                      ₹{(orderData.amount / 100).toFixed(2)}
                    </td>
                  </tr>
                  <tr style={{ borderBottom: "1px solid var(--border-subtle)" }}>
                    <td style={{ padding: "0.875rem 1.25rem", color: "var(--text-secondary)" }}>Applicant Name</td>
                    <td style={{ padding: "0.875rem 1.25rem", textAlign: "right", fontWeight: 600 }}>{formData.name}</td>
                  </tr>
                  <tr>
                    <td style={{ padding: "0.875rem 1.25rem", color: "var(--text-secondary)" }}>Registered Mobile</td>
                    <td style={{ padding: "0.875rem 1.25rem", textAlign: "right", fontWeight: 600 }}>+91 {formData.mobile}</td>
                  </tr>
                </tbody>
              </table>
            </div>

            {/* Mandatory Disclosures */}
            <div style={{ background: "#eff6ff", border: "1px solid #bfdbfe", borderRadius: "var(--radius-md)", padding: "1.125rem", marginBottom: "1.5rem", fontSize: "0.8125rem", color: "#1e3a8a", lineHeight: 1.5 }}>
              <div style={{ fontWeight: 700, marginBottom: "0.35rem", display: "flex", alignItems: "center", gap: "0.35rem" }}>
                <span>🛡️</span> Mandatory Service Fee &amp; Refund Policy Disclosure
              </div>
              <p style={{ margin: 0 }}>
                The final service fee includes all applicable taxes. The fee is non-refundable as it covers application processing, documentation verification, and credit evaluation. Paying this fee does not guarantee loan approval.
              </p>
            </div>

            <button
              type="button"
              onClick={handleProceedToPayment}
              className="btn btn-primary btn-lg btn-full"
              disabled={loading}
              style={{ fontWeight: 700, fontSize: "1rem" }}
            >
              {loading ? (
                <span style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: "0.5rem" }}>
                  <svg className="spin" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                    <circle cx="12" cy="12" r="10" strokeOpacity="0.25" stroke="currentColor" />
                    <path d="M12 2a10 10 0 0 1 10 10" />
                  </svg>
                  Opening Secure Payment...
                </span>
              ) : (
                "PROCEED TO PAYMENT"
              )}
            </button>

            <div style={{ marginTop: "1rem", textAlign: "center" }}>
              <button
                type="button"
                onClick={() => setStep("form")}
                disabled={loading}
                style={{ background: "none", border: "none", color: "var(--text-muted)", fontSize: "0.8125rem", cursor: "pointer", textDecoration: "underline" }}
              >
                ← Edit Applicant Details
              </button>
            </div>

            <p style={{ textAlign: "center", fontSize: "0.75rem", color: "var(--text-muted)", marginTop: "1.25rem" }}>
              🔒 256-bit Encrypted Payment Gateway powered by Razorpay
            </p>
          </div>
        )}
      </div>

      <dialog
        ref={termsDialogRef}
        className="terms-dialog"
        aria-labelledby="terms-dialog-title"
        onCancel={(event) => {
          event.preventDefault();
          setTermsOpen(false);
        }}
        onClick={(event) => {
          if (event.target === event.currentTarget) setTermsOpen(false);
        }}
      >
        <div className="terms-dialog__header">
          <h2 id="terms-dialog-title">Terms &amp; Conditions</h2>
          <button
            ref={termsCloseRef}
            className="terms-dialog__close"
            type="button"
            aria-label="Close Terms & Conditions"
            onClick={() => setTermsOpen(false)}
          >
            <span aria-hidden="true">&times;</span>
          </button>
        </div>
        <div className="terms-dialog__body">
          <section className="terms-section" aria-labelledby="terms-section-one">
            <h3 id="terms-section-one">1. Data Localization Compliance</h3>
            <p>
              The RBI mandates that all data related to payment transactions must be stored only in systems located in India.
            </p>
            <ul>
              <li>
                Ensure that the cloud server or database where you store your transaction logs (even if it only contains the{" "}
                <code>payment_id</code>, user email, and transaction amount) is physically hosted in an Indian data center region
                (e.g., AWS Mumbai region <code>ap-south-1</code>, Google Cloud Mumbai/Delhi, etc.).
              </li>
            </ul>
          </section>

          <section className="terms-section" aria-labelledby="terms-section-two">
            <h3 id="terms-section-two">2. General Data Privacy &amp; DPDP Act Compliance</h3>
            <p>
              Because the Razorpay Payment ID in your database will likely be mapped to a user account (containing names, phone
              numbers, or email addresses), it falls under the scope of India&apos;s Digital Personal Data Protection (DPDP) Act:
            </p>
            <ul>
              <li>
                <strong>Purpose Limitation:</strong> You must state in your Privacy Policy that you collect and store transaction
                references purely for billing, order fulfillment, and dispute resolution.
              </li>
              <li>
                <strong>Access Controls:</strong> Restrict database access so that internal employees cannot view a customer&apos;s
                transaction history without an operational requirement.
              </li>
            </ul>
          </section>
        </div>
      </dialog>
    </div>
  );
}
