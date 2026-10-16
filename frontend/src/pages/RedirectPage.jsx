import { useCallback, useEffect, useRef, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { Check, AlertCircle, Info, ShieldCheck } from "lucide-react";
import CustomerShell from "../components/CustomerShell";
import Spinner from "../components/Spinner";
import { api } from "../lib/api";
import { loadRazorpay } from "../lib/razorpay";
import { BRAND } from "../config";
import { inr } from "../lib/format";
import { DEFAULT_PRODUCT, findProduct, recallProduct } from "../data/catalog";
import {
  FIELD_ORDER, LIMITS, sanitizeMobileInput,
  validateConsent, validateDob, validateEmail, validateMobile, validateName, validateRegistration,
} from "../lib/validation";

const FIELD_IDS = { name: "reg-name", dob: "reg-dob", email: "reg-email", mobile: "reg-mobile", consent: "reg-consent" };
const RULES = {
  name: (d) => validateName(d.name),
  dob: (d) => validateDob(d.dob),
  email: (d) => validateEmail(d.email),
  mobile: (d) => validateMobile(d.mobile),
  consent: (d) => validateConsent(d.consent),
};

/** Stable (module-level) so inputs never remount while typing. */
function FieldError({ id, message }) {
  return message ? <p id={id} role="alert" className="mt-1.5 flex items-start gap-1 text-xs font-medium text-red-700"><AlertCircle className="mt-px h-3.5 w-3.5 shrink-0" aria-hidden="true" /><span>{message}</span></p> : null;
}
const fieldClass = (invalid) => `field mt-1 ${invalid ? "!border-red-500 focus:!border-red-500 focus:!ring-red-500/20" : ""}`;

/**
 * Screen 2: Apply for Loan Assistance (Customer Application Form)
 * Screen 3: Complete Your Payment (Payment Gateway Review & Initiation)
 */
export default function RedirectPage() {
  const [sp] = useSearchParams();
  const nav = useNavigate();
  const product = findProduct(sp.get("product")) || findProduct(recallProduct()) || findProduct(DEFAULT_PRODUCT);
  const hasOrderToRetry = Boolean(sp.get("order"));

  const [phase, setPhase] = useState(hasOrderToRetry ? "ready" : "details"); // details | ready | working | checkout | verifying | cancelled | error
  const [detailsSubmitted, setDetailsSubmitted] = useState(false);
  const [details, setDetails] = useState({ name: "", dob: "", email: "", mobile: "" });
  const [consentAccepted, setConsentAccepted] = useState(false);
  const [termsOpen, setTermsOpen] = useState(false);
  const [emailWarning, setEmailWarning] = useState("");
  const [checkingEmail, setCheckingEmail] = useState(false);
  const [createdOrder, setCreatedOrder] = useState(null);
  const [errors, setErrors] = useState({}); // { name?, dob?, email?, mobile?, consent? }
  const [touched, setTouched] = useState({});
  const [seconds, setSeconds] = useState(5);
  const [error, setError] = useState("");
  const started = useRef(false);
  const done = useRef(false);
  const failure = useRef(null);
  const orderRef = useRef(sp.get("order"));

  const go = (path) => { done.current = true; nav(path, { replace: true }); };

  // Non-blocking duplicate email check
  const checkEmailExists = useCallback(async (emailVal) => {
    const trimmed = (emailVal || "").trim().toLowerCase();
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(trimmed)) {
      setEmailWarning("");
      return;
    }
    setCheckingEmail(true);
    try {
      const res = await api(`/api/customers/check-email?email=${encodeURIComponent(trimmed)}`);
      if (res.exists) {
        setEmailWarning("Notice: An application with this email already exists in our system. You are submitting a new application.");
      } else {
        setEmailWarning("");
      }
    } catch {
      setEmailWarning("");
    } finally {
      setCheckingEmail(false);
    }
  }, []);

  const start = useCallback(async () => {
    if (started.current) return;
    started.current = true;
    setPhase("working");
    setError("");
    try {
      let o = createdOrder;
      if (!o) {
        const body = { productId: product.slug, consent: consentAccepted };
        if (!orderRef.current) Object.assign(body, details);
        if (orderRef.current) body.orderId = orderRef.current;
        o = await api("/api/payments/create", { method: "POST", body });
        orderRef.current = o.orderId;
        setCreatedOrder(o);
      }
      await loadRazorpay();

      const rzp = new window.Razorpay({
        key: o.keyId,
        amount: o.amount,
        currency: o.currency,
        order_id: o.razorpayOrderId,
        name: BRAND,
        description: o.product,
        prefill: {
          name: details.name || undefined,
          email: details.email || undefined,
          contact: details.mobile || undefined,
        },
        theme: { color: "#1d5fe0" },
        retry: { enabled: true },
        handler: async (resp) => {
          done.current = true;
          setPhase("verifying");
          try {
            const v = await api("/api/payments/verify", { method: "POST", body: resp });
            nav(`/${v.status === "PAID" ? "payment-success" : "payment-pending"}?order=${o.orderId}`, { replace: true });
          } catch (e) {
            nav(`/${e.code === "PAYMENT_FAILED" ? "payment-failed" : "payment-pending"}?order=${o.orderId}`, { replace: true });
          }
        },
        modal: {
          ondismiss: () => {
            if (done.current) return;
            started.current = false;
            if (failure.current) go(`/payment-failed?order=${o.orderId}`);
            else setPhase("cancelled");
          },
        },
      });
      rzp.on("payment.failed", (r) => { failure.current = r?.error?.description || "Payment failed"; });
      rzp.open();
      setPhase("checkout");
    } catch (e) {
      started.current = false;
      const id = e.data?.orderId;
      if (e.code === "ALREADY_PAID" && id) return go(`/payment-success?order=${id}`);
      if (e.code === "PAYMENT_PENDING" && id) return go(`/payment-pending?order=${id}`);
      setError(e.message);
      setPhase("error");
    }
  }, [createdOrder, details, sp, product.slug, consentAccepted]);

  /** Validate one field (used on blur and, once touched, on change). */
  const validateField = (field, data) => setErrors((cur) => {
    const message = RULES[field](data);
    const next = { ...cur };
    if (message) next[field] = message; else delete next[field];
    return next;
  });
  const update = (field, value) => {
    setDetails((cur) => ({ ...cur, [field]: value }));
    if (touched[field]) validateField(field, { ...details, [field]: value });
  };
  const blurField = (field) => {
    setTouched((cur) => ({ ...cur, [field]: true }));
    const data = { ...details, consent: consentAccepted };
    validateField(field, data);
    if (field === "email" && !validateEmail(data.email)) checkEmailExists(data.email);
  };

  const submitDetails = async (event) => {
    event.preventDefault();
    const result = validateRegistration({ ...details, consent: consentAccepted });
    if (Object.keys(result.errors).length) {
      setErrors(result.errors);
      setTouched({ name: true, dob: true, email: true, mobile: true, consent: true });
      const first = FIELD_ORDER.find((f) => result.errors[f]);
      document.getElementById(FIELD_IDS[first])?.focus();
      return;
    }

    setErrors({});
    const submittedDetails = { ...details, ...result.values, consent: true };
    setDetails(submittedDetails);
    setPhase("submitting");
    setError("");

    try {
      const order = await api("/api/payments/create", {
        method: "POST",
        body: { productId: product.slug, ...submittedDetails },
      });
      orderRef.current = order.orderId;
      setCreatedOrder(order);
      setDetailsSubmitted(true);
      setPhase("ready");
    } catch (e) {
      const id = e.data?.orderId;
      if (e.code === "ALREADY_PAID" && id) return go(`/payment-success?order=${id}`);
      if (e.code === "PAYMENT_PENDING" && id) return go(`/payment-pending?order=${id}`);
      setError(e.message);
      setPhase("error");
    }
  };

  const busy = phase === "submitting" || phase === "working" || phase === "verifying";
  const isForm = phase === "details" || phase === "submitting";

  return (
    <CustomerShell header={false}>
      {/* Screen 2 Header */}
      {isForm && (
        <div className="border-b border-slate-100 bg-slate-50/50 px-6 pb-5 pt-6 text-left">
          <div className="flex items-center justify-between">
            <span className="text-xs font-bold uppercase tracking-wider text-blue-600">FFA FINSERV</span>
            <span className="text-xs font-medium text-slate-500">Step 1 of 2</span>
          </div>
          <h1 className="mt-1.5 text-xl font-bold text-ink">Apply for Loan Assistance</h1>
          <p className="mt-1 text-xs text-slate-600">
            Please enter your details accurately to proceed with your service request.
          </p>
        </div>
      )}

      {/* Screen 3 Header (Payment Gateway Review) */}
      {phase === "ready" && (
        <div className="border-b border-slate-100 bg-slate-50/50 px-6 pb-5 pt-6 text-left">
          <div className="flex items-center justify-between">
            <span className="text-xs font-bold uppercase tracking-wider text-blue-600">FFA FINSERV</span>
            <span className="text-xs font-medium text-slate-500">Step 2 of 2</span>
          </div>
          <h1 className="mt-1.5 text-xl font-bold text-ink">Complete Your Payment</h1>
          <p className="mt-1 text-xs text-slate-600">
            Secure payment for FFA Finserv services
          </p>
        </div>
      )}

      <div className={isForm ? "px-6 pb-8 pt-5 text-left" : phase === "ready" ? "px-6 pb-8 pt-5 text-left" : "px-6 py-12 text-center sm:py-16"}>
        {/* Error / Cancelled Feedback */}
        {phase === "error" || phase === "cancelled" ? (
          <div>
            <span className="mx-auto flex h-20 w-20 items-center justify-center rounded-full bg-amber-50">
              <AlertCircle className="h-9 w-9 text-amber-500" aria-hidden="true" />
            </span>
            <h1 className="mt-6 text-2xl font-bold text-ink">
              {phase === "cancelled" ? "Payment not completed" : "Couldn't start payment"}
            </h1>
            <p className="mx-auto mt-2 max-w-xs text-sm text-slate-600">
              {phase === "cancelled"
                ? "You closed the payment window. Your details are saved — you can try again."
                : error}
            </p>
            <button className="btn-primary mt-6" onClick={start}>
              Try Again
            </button>
          </div>
        ) : null}

        {/* Verifying Feedback */}
        {phase === "verifying" && (
          <div>
            <span className="mx-auto flex h-20 w-20 items-center justify-center rounded-full bg-blue-50">
              <Spinner className="h-9 w-9 text-blue-600" />
            </span>
            <h1 className="mt-6 text-2xl font-bold text-ink">Verifying payment</h1>
            <p className="mx-auto mt-2 max-w-xs text-sm text-slate-600">
              Confirming your payment. Please do not close this window.
            </p>
          </div>
        )}

        {/* =========================================================================
            SCREEN 2 — Customer Application Form
           ========================================================================= */}
        {isForm && (
          <form onSubmit={submitDetails} noValidate className="space-y-4">
            {/* Field 1: Full Name */}
            <div>
              <label htmlFor="reg-name" className="block text-sm font-semibold text-ink">
                1. Full Name as per Aadhaar <span className="text-red-600" aria-hidden="true">*</span>
              </label>
              <input
                id="reg-name"
                autoComplete="name"
                aria-required="true"
                aria-invalid={Boolean(errors.name)}
                placeholder="Enter your full name"
                className={fieldClass(errors.name)}
                maxLength={LIMITS.name}
                disabled={busy}
                onBlur={() => blurField("name")}
                onChange={(event) => update("name", event.target.value)}
                value={details.name}
              />
              <FieldError id="err-name" message={errors.name} />
            </div>

            {/* Field 2: Date of Birth */}
            <div>
              <label htmlFor="reg-dob" className="block text-sm font-semibold text-ink">
                2. Date of Birth <span className="text-red-600" aria-hidden="true">*</span>
              </label>
              <input
                id="reg-dob"
                type="text"
                aria-required="true"
                aria-invalid={Boolean(errors.dob)}
                placeholder="DD / MM / YYYY"
                className={fieldClass(errors.dob)}
                maxLength={10}
                disabled={busy}
                onBlur={() => blurField("dob")}
                onChange={(event) => update("dob", event.target.value)}
                value={details.dob}
              />
              {errors.dob ? (
                <FieldError id="err-dob" message={errors.dob} />
              ) : (
                <p className="mt-1 text-xs text-slate-400">Format: DD / MM / YYYY (Applicant must be 18+ years)</p>
              )}
            </div>

            {/* Field 3: Email ID */}
            <div>
              <label htmlFor="reg-email" className="block text-sm font-semibold text-ink">
                3. Email ID <span className="text-red-600" aria-hidden="true">*</span>
              </label>
              <input
                id="reg-email"
                type="email"
                autoComplete="email"
                inputMode="email"
                autoCapitalize="none"
                spellCheck={false}
                placeholder="Enter your email address"
                aria-required="true"
                aria-invalid={Boolean(errors.email)}
                className={fieldClass(errors.email)}
                maxLength={LIMITS.email}
                disabled={busy}
                onBlur={() => blurField("email")}
                onChange={(event) => update("email", event.target.value.replace(/\s/g, ""))}
                value={details.email}
              />
              <FieldError id="err-email" message={errors.email} />
            </div>

            {emailWarning && !errors.email && (
              <div role="status" className="flex items-start gap-2.5 rounded-lg border border-amber-200 bg-amber-50 p-2.5 text-xs text-amber-800">
                <Info className="mt-0.5 h-3.5 w-3.5 shrink-0 text-amber-600" aria-hidden="true" />
                <span className="leading-relaxed">{emailWarning}</span>
              </div>
            )}

            {/* Field 4: Mobile Number Linked to Aadhaar */}
            <div>
              <label htmlFor="reg-mobile" className="block text-sm font-semibold text-ink">
                4. Mobile Number Linked to Aadhaar <span className="text-red-600" aria-hidden="true">*</span>
              </label>
              <div className="mt-1 flex rounded-lg shadow-sm">
                <span className="inline-flex items-center rounded-l-lg border border-r-0 border-slate-300 bg-slate-50 px-3 text-xs font-semibold text-slate-600">
                  +91
                </span>
                <input
                  id="reg-mobile"
                  autoComplete="tel"
                  inputMode="tel"
                  placeholder="Enter 10-digit mobile number"
                  aria-required="true"
                  aria-invalid={Boolean(errors.mobile)}
                  className={`field rounded-l-none !mt-0 ${errors.mobile ? "!border-red-500 focus:!border-red-500 focus:!ring-red-500/20" : ""}`}
                  maxLength={LIMITS.mobile}
                  disabled={busy}
                  onBlur={() => blurField("mobile")}
                  onChange={(event) => update("mobile", sanitizeMobileInput(event.target.value))}
                  type="tel"
                  value={details.mobile}
                />
              </div>
              <FieldError id="err-mobile" message={errors.mobile} />
            </div>

            {/* Footnote */}
            <p className="text-xs text-slate-500">
              * All fields are mandatory. The mobile number should be one the customer can access.
            </p>

            {/* Mandatory Consent Checkbox */}
            <div className={`rounded-xl border p-4 text-xs ${errors.consent ? "border-red-300 bg-red-50/40" : "border-slate-200 bg-slate-50"}`}>
              <div className="flex items-start gap-2.5">
                <input
                  id="reg-consent"
                  type="checkbox"
                  className="mt-0.5 h-4 w-4 shrink-0 rounded border-slate-300 text-blue-600 focus:ring-blue-500 cursor-pointer"
                  aria-required="true"
                  checked={consentAccepted}
                  onChange={(e) => {
                    setConsentAccepted(e.target.checked);
                    setTouched((cur) => ({ ...cur, consent: true }));
                    validateField("consent", { consent: e.target.checked });
                  }}
                  disabled={busy}
                />
                <label htmlFor="reg-consent" className="text-xs leading-relaxed text-slate-700 font-medium cursor-pointer">
                  <span>I agree to the </span>
                  <button
                    type="button"
                    className="text-blue-600 font-bold underline hover:text-blue-800 focus:outline-none"
                    onClick={(e) => {
                      e.preventDefault();
                      e.stopPropagation();
                      setTermsOpen(true);
                    }}
                  >
                    Terms &amp; Conditions
                  </button>
                  <span> and acknowledge the applicable data privacy terms.</span>
                </label>
              </div>
              <FieldError id="err-consent" message={errors.consent} />
            </div>

            <button className="btn-primary w-full py-3 text-sm font-bold flex items-center justify-center gap-2" disabled={busy} type="submit">
              {busy ? <><Spinner className="h-4 w-4" />Saving &amp; Processing…</> : "SAVE & APPLY"}
            </button>
          </form>
        )}

        {/* =========================================================================
            SCREEN 3 — Payment Gateway (Complete Your Payment)
           ========================================================================= */}
        {phase === "ready" && (
          <div className="space-y-5">
            {/* Payment Details Table */}
            <div className="rounded-xl border border-slate-200 bg-white overflow-hidden shadow-sm">
              <table className="w-full text-left text-sm divide-y divide-slate-100">
                <tbody className="divide-y divide-slate-100">
                  <tr className="bg-slate-50/60">
                    <td className="px-4 py-3 font-medium text-slate-600">Service</td>
                    <td className="px-4 py-3 font-semibold text-ink text-right">Loan Assistance Service</td>
                  </tr>
                  <tr>
                    <td className="px-4 py-3 font-medium text-slate-600">Service Fee</td>
                    <td className="px-4 py-3 font-bold text-blue-600 text-right text-lg">
                      {createdOrder?.amount ? inr(createdOrder.amount) : "Confirmed before payment"}
                    </td>
                  </tr>
                  <tr className="bg-slate-50/60">
                    <td className="px-4 py-3 font-medium text-slate-600">Applicant</td>
                    <td className="px-4 py-3 font-medium text-slate-800 text-right">{details.name || "—"}</td>
                  </tr>
                  <tr>
                    <td className="px-4 py-3 font-medium text-slate-600">Mobile</td>
                    <td className="px-4 py-3 font-medium text-slate-800 text-right">{details.mobile || "—"}</td>
                  </tr>
                </tbody>
              </table>
            </div>

            {/* Mandatory Disclosures */}
            <div className="rounded-xl border border-blue-100 bg-blue-50/60 p-4 text-xs text-slate-700 space-y-1.5 leading-relaxed">
              <div className="flex items-center gap-1.5 font-bold text-blue-900">
                <ShieldCheck className="h-4 w-4 text-blue-600" aria-hidden="true" />
                <span>Service Fee &amp; Refund Policy Disclosure</span>
              </div>
              <p>
                The final service fee includes all applicable taxes (GST). The service fee is non-refundable as it covers application processing, profile verification, and credit evaluation.
              </p>
              <p className="text-slate-500 text-[11px]">
                Paying the service fee does not guarantee loan approval from partner lenders.
              </p>
            </div>

            {/* Primary Action: PROCEED TO PAYMENT */}
            <button
              className="btn-primary w-full py-3.5 text-base font-bold shadow-md hover:shadow-lg transition-all flex items-center justify-center gap-2"
              disabled={busy || phase === "checkout"}
              onClick={start}
            >
              {busy ? (
                <><Spinner className="h-5 w-5" />Opening Razorpay…</>
              ) : (
                "PROCEED TO PAYMENT"
              )}
            </button>

            <p className="text-center text-xs text-slate-400 flex items-center justify-center gap-1.5">
              <ShieldCheck className="h-3.5 w-3.5 text-emerald-600" />
              100% Secure 256-bit Encrypted Checkout powered by Razorpay
            </p>
          </div>
        )}
      </div>

      {/* Terms & Conditions Modal */}
      {termsOpen && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-sm"
          onClick={() => setTermsOpen(false)}
        >
          <div
            className="relative w-full max-w-2xl max-h-[85vh] overflow-hidden rounded-2xl bg-white shadow-2xl flex flex-col"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between border-b border-slate-200 px-6 py-4">
              <h2 className="text-lg font-extrabold text-slate-900">Terms &amp; Conditions</h2>
              <button
                type="button"
                className="rounded-lg p-1.5 text-slate-400 hover:bg-slate-100 hover:text-slate-700 focus:outline-none"
                aria-label="Close Terms & Conditions"
                onClick={() => setTermsOpen(false)}
              >
                <span className="text-xl leading-none">&times;</span>
              </button>
            </div>
            <div className="overflow-y-auto px-6 py-5 space-y-6 text-sm text-slate-700 leading-relaxed">
              <section>
                <h3 className="text-base font-bold text-slate-900 mb-2">1. Data Localization Compliance</h3>
                <p>
                  The RBI mandates that all data related to payment transactions must be stored only in systems located in India.
                </p>
                <ul className="list-disc pl-5 mt-2 space-y-1">
                  <li>
                    Ensure that the cloud server or database where you store your transaction logs (even if it only contains the{" "}
                    <code className="bg-slate-100 px-1 py-0.5 rounded text-xs font-mono">payment_id</code>, user email, and transaction amount) is physically hosted in an Indian data center region
                    (e.g., AWS Mumbai region <code className="bg-slate-100 px-1 py-0.5 rounded text-xs font-mono">ap-south-1</code>, Google Cloud Mumbai/Delhi, etc.).
                  </li>
                </ul>
              </section>

              <section>
                <h3 className="text-base font-bold text-slate-900 mb-2">2. General Data Privacy &amp; DPDP Act Compliance</h3>
                <p>
                  Because the Razorpay Payment ID in your database will likely be mapped to a user account (containing names, phone
                  numbers, or email addresses), it falls under the scope of India&apos;s Digital Personal Data Protection (DPDP) Act:
                </p>
                <ul className="list-disc pl-5 mt-2 space-y-1">
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
            <div className="border-t border-slate-100 px-6 py-3 bg-slate-50 flex justify-end">
              <button
                type="button"
                className="btn-primary text-xs font-semibold py-2 px-4"
                onClick={() => setTermsOpen(false)}
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}
    </CustomerShell>
  );
}
