import Link from "next/link";
import { getActiveServiceFeePaise } from "@/lib/settings";

export const dynamic = "force-dynamic";

export default async function HomePage() {
  const feeRupees = Math.round((await getActiveServiceFeePaise()) / 100);
  const formattedFee = feeRupees.toLocaleString("en-IN");
  return (
    <div className="container" style={{ paddingTop: "1rem", paddingBottom: "3rem" }}>
      {/* Hero Banner (matches Screen 1 — FFA FINSERV Landing Page) */}
      <section className="hero-banner">
        <div className="hero-content">
          <div style={{ display: "inline-flex", alignItems: "center", gap: "0.5rem", background: "rgba(255, 255, 255, 0.15)", padding: "0.375rem 0.875rem", borderRadius: "9999px", fontSize: "0.8125rem", fontWeight: 600, marginBottom: "1.25rem", backdropFilter: "blur(8px)" }}>
            <span style={{ width: "8px", height: "8px", borderRadius: "50%", background: "#4ade80" }}></span>
            FFA FINSERV • Financial Assistance Services
          </div>
          <h1 className="hero-title" style={{ fontSize: "2.75rem", lineHeight: 1.15, fontWeight: 800 }}>
            Not Getting a Loan?<br />
            <span style={{ color: "#fef08a" }}>Low Credit Score?</span><br />
            No Problem!
          </h1>
          <p className="hero-subtitle" style={{ fontSize: "1.125rem", marginTop: "1rem" }}>
            Apply for Instant Loan Assistance in Less Than 30 Seconds*
          </p>
          <div style={{ display: "flex", gap: "1rem", flexWrap: "wrap", marginTop: "1.5rem" }}>
            <Link href="/register" className="btn btn-secondary btn-lg" style={{ color: "var(--color-primary)", fontWeight: 700, fontSize: "1rem", padding: "0.875rem 1.75rem" }}>
              APPLY FOR SERVICE →
            </Link>
            <Link href="/my-orders" className="btn btn-outline btn-lg" style={{ borderColor: "rgba(255,255,255,0.4)", color: "white" }}>
              Check Order Status
            </Link>
          </div>
          <p style={{ fontSize: "0.75rem", opacity: 0.8, marginTop: "0.75rem" }}>
            * Dedicated team reviews applications within 72 hours.
          </p>
        </div>

        {/* Floating Hero Visual Graphic */}
        <div className="hero-graphic">
          <div className="hero-card-preview">
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", borderBottom: "1px solid rgba(255,255,255,0.2)", paddingBottom: "1rem" }}>
              <div style={{ display: "flex", alignItems: "center", gap: "0.75rem" }}>
                <div style={{ width: "40px", height: "40px", borderRadius: "50%", background: "#10b981", display: "flex", alignItems: "center", justifyContent: "center" }}>
                  <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                    <polyline points="20 6 9 17 4 12"></polyline>
                  </svg>
                </div>
                <div>
                  <div style={{ fontWeight: 700, fontSize: "0.9375rem" }}>FFA FINSERV</div>
                  <div style={{ fontSize: "0.75rem", opacity: 0.85 }}>Financial Assistance Services</div>
                </div>
              </div>
              <span className="badge badge-success" style={{ background: "rgba(16, 185, 129, 0.2)", color: "#6ee7b7", border: "1px solid #10b981" }}>
                INSTANT
              </span>
            </div>

            <div style={{ display: "flex", flexDirection: "column", gap: "0.625rem", fontSize: "0.8125rem" }}>
              <div style={{ display: "flex", justifyContent: "space-between", opacity: 0.9 }}>
                <span>Service</span>
                <span style={{ fontWeight: 600 }}>Loan Assistance Service</span>
              </div>
              <div style={{ display: "flex", justifyContent: "space-between", opacity: 0.9 }}>
                <span>Service Fee</span>
                <span style={{ fontWeight: 700, fontSize: "1.125rem", color: "#fef08a" }}>₹{feeRupees.toLocaleString("en-IN", { minimumFractionDigits: 2 })}</span>
              </div>
              <div style={{ display: "flex", justifyContent: "space-between", opacity: 0.9 }}>
                <span>Gateway</span>
                <span style={{ fontWeight: 600 }}>Razorpay Secure</span>
              </div>
            </div>

            <div style={{ background: "rgba(255, 255, 255, 0.1)", borderRadius: "10px", padding: "0.75rem 1rem", display: "flex", alignItems: "center", gap: "0.5rem", fontSize: "0.75rem" }}>
              <span>⚡</span>
              <span>72-Hour Response SLA &amp; Instant Email Confirmation</span>
            </div>
          </div>
        </div>
      </section>

      {/* 3 Core Value Props (matches project.png Screen 1) */}
      <section className="features-grid">
        <div className="feature-card">
          <div className="feature-icon-wrapper feature-icon-blue">
            <svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"></path>
              <circle cx="12" cy="7" r="4"></circle>
            </svg>
          </div>
          <h3 className="feature-title">Easy Registration</h3>
          <p className="feature-desc">
            Quick and simple online registration form. Provide your name, contact details, and verification data in under a minute.
          </p>
        </div>

        <div className="feature-card">
          <div className="feature-icon-wrapper feature-icon-cyan">
            <svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <rect x="2" y="5" width="20" height="14" rx="2"></rect>
              <line x1="2" y1="10" x2="22" y2="10"></line>
            </svg>
          </div>
          <h3 className="feature-title">Secure Payment</h3>
          <p className="feature-desc">
            Industry-grade 256-bit encryption powered by Razorpay. Pay seamlessly with UPI, Credit/Debit cards, or Net Banking.
          </p>
        </div>

        <div className="feature-card">
          <div className="feature-icon-wrapper feature-icon-indigo">
            <svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"></path>
              <polyline points="22 4 12 14.01 9 11.01"></polyline>
            </svg>
          </div>
          <h3 className="feature-title">Instant Verification</h3>
          <p className="feature-desc">
            Get instant verification receipt, automated email invoice delivery, and synchronized records on the admin dashboard.
          </p>
        </div>
      </section>

      {/* Product Card & Journey Flow (matches frontend.png) */}
      <section style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "2rem", margin: "2rem 0", alignItems: "stretch" }}>
        {/* Product A Card */}
        <div className="card card-hover card-elevated" style={{ display: "flex", flexDirection: "column", justifyContent: "space-between" }}>
          <div>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: "1rem" }}>
              <div>
                <span className="badge badge-info" style={{ marginBottom: "0.5rem" }}>PRIMARY PRODUCT</span>
                <h2 style={{ fontSize: "1.75rem", fontWeight: 800 }}>Product A</h2>
                <p style={{ color: "var(--text-secondary)", marginTop: "0.25rem" }}>
                  Customer Onboarding &amp; Verification Package
                </p>
              </div>
              <div style={{ textAlign: "right" }}>
                <span style={{ fontSize: "2rem", fontWeight: 800, color: "var(--color-primary)" }}>₹{formattedFee}</span>
                <span style={{ fontSize: "0.8125rem", color: "var(--text-muted)", display: "block" }}>One-time fee</span>
              </div>
            </div>

            <div style={{ height: "1px", background: "var(--border-subtle)", margin: "1.5rem 0" }} />

            <div style={{ display: "flex", flexDirection: "column", gap: "0.875rem", marginBottom: "2rem" }}>
              <div style={{ display: "flex", alignItems: "center", gap: "0.75rem", fontSize: "0.9375rem" }}>
                <span style={{ color: "var(--color-success)", fontWeight: 700 }}>✓</span>
                <span>Complete Customer Identification &amp; Onboarding</span>
              </div>
              <div style={{ display: "flex", alignItems: "center", gap: "0.75rem", fontSize: "0.9375rem" }}>
                <span style={{ color: "var(--color-success)", fontWeight: 700 }}>✓</span>
                <span>Immediate Razorpay cryptographic signature verification</span>
              </div>
              <div style={{ display: "flex", alignItems: "center", gap: "0.75rem", fontSize: "0.9375rem" }}>
                <span style={{ color: "var(--color-success)", fontWeight: 700 }}>✓</span>
                <span>Automated Google Sheets ledger logging</span>
              </div>
              <div style={{ display: "flex", alignItems: "center", gap: "0.75rem", fontSize: "0.9375rem" }}>
                <span style={{ color: "var(--color-success)", fontWeight: 700 }}>✓</span>
                <span>Instant Confirmation Email with official receipt</span>
              </div>
            </div>
          </div>

          <Link href="/register" className="btn btn-primary btn-lg btn-full">
            Register &amp; Pay ₹{formattedFee} Now
          </Link>
        </div>

        {/* Customer Journey Summary Card (matches frontend.png) */}
        <div className="card" style={{ background: "linear-gradient(180deg, #f8fafc 0%, #ffffff 100%)" }}>
          <h3 style={{ fontSize: "1.25rem", fontWeight: 700, marginBottom: "0.5rem" }}>
            Customer Journey Flow
          </h3>
          <p style={{ fontSize: "0.875rem", color: "var(--text-muted)", marginBottom: "1.5rem" }}>
            The 5-stage automated transaction and verification lifecycle:
          </p>

          <div style={{ display: "flex", flexDirection: "column", gap: "1rem" }}>
            <div style={{ display: "flex", alignItems: "center", gap: "1rem" }}>
              <div className="step-bubble" style={{ width: "2.25rem", height: "2.25rem", fontSize: "0.875rem" }}>1</div>
              <div>
                <div style={{ fontWeight: 600, fontSize: "0.9375rem" }}>Landing &amp; Selection</div>
                <div style={{ fontSize: "0.8125rem", color: "var(--text-muted)" }}>Explore Product A &amp; click Get Started</div>
              </div>
            </div>

            <div style={{ display: "flex", alignItems: "center", gap: "1rem" }}>
              <div className="step-bubble" style={{ width: "2.25rem", height: "2.25rem", fontSize: "0.875rem" }}>2</div>
              <div>
                <div style={{ fontWeight: 600, fontSize: "0.9375rem" }}>Registration Form</div>
                <div style={{ fontSize: "0.8125rem", color: "var(--text-muted)" }}>Enter Name, Mobile, Email &amp; PAN</div>
              </div>
            </div>

            <div style={{ display: "flex", alignItems: "center", gap: "1rem" }}>
              <div className="step-bubble" style={{ width: "2.25rem", height: "2.25rem", fontSize: "0.875rem" }}>3</div>
              <div>
                <div style={{ fontWeight: 600, fontSize: "0.9375rem" }}>Razorpay Checkout</div>
                <div style={{ fontSize: "0.8125rem", color: "var(--text-muted)" }}>Pay ₹{formattedFee} via UPI, Cards, or Net Banking</div>
              </div>
            </div>

            <div style={{ display: "flex", alignItems: "center", gap: "1rem" }}>
              <div className="step-bubble" style={{ width: "2.25rem", height: "2.25rem", fontSize: "0.875rem" }}>4</div>
              <div>
                <div style={{ fontWeight: 600, fontSize: "0.9375rem" }}>Automated Verification</div>
                <div style={{ fontSize: "0.8125rem", color: "var(--text-muted)" }}>Server validates HMAC-SHA256 signature</div>
              </div>
            </div>

            <div style={{ display: "flex", alignItems: "center", gap: "1rem" }}>
              <div className="step-bubble completed" style={{ width: "2.25rem", height: "2.25rem", fontSize: "0.875rem" }}>5</div>
              <div>
                <div style={{ fontWeight: 600, fontSize: "0.9375rem" }}>Email &amp; Sheets Sync</div>
                <div style={{ fontSize: "0.8125rem", color: "var(--text-muted)" }}>Customer receives receipt; sheet row updated</div>
              </div>
            </div>
          </div>
        </div>
      </section>
    </div>
  );
}
