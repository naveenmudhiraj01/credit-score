"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

export function Footer() {
  const pathname = usePathname();
  if (pathname?.startsWith("/admin") || pathname?.startsWith("/dashboard")) {
    return null;
  }

  return (
    <footer className="footer">
      <div className="container">
        <div className="footer-content">
          <div>
            <div style={{ display: "flex", alignItems: "center", gap: "0.5rem", marginBottom: "0.5rem" }}>
              <div style={{ width: "24px", height: "24px", borderRadius: "6px", background: "var(--color-primary)", display: "flex", alignItems: "center", justifyContent: "center", color: "white" }}>
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" />
                </svg>
              </div>
              <span style={{ fontWeight: 700, fontSize: "1rem" }}>FFA FINSERV</span>
            </div>
            <p style={{ fontSize: "0.875rem", color: "var(--text-muted)", maxWidth: "340px" }}>
              FFA FINSERV — Professional Financial Assistance Services.
            </p>
          </div>

          <div style={{ display: "flex", gap: "2.5rem", flexWrap: "wrap" }}>
            <div>
              <div style={{ fontSize: "0.8125rem", fontWeight: 700, color: "var(--text-primary)", marginBottom: "0.75rem", textTransform: "uppercase" }}>Quick Links</div>
              <div style={{ display: "flex", flexDirection: "column", gap: "0.5rem", fontSize: "0.875rem", color: "var(--text-secondary)" }}>
                <Link href="/">Home</Link>
                <Link href="/register">Apply for Service</Link>
                <Link href="/my-orders">Check Order Status</Link>
              </div>
            </div>

            <div>
              <div style={{ fontSize: "0.8125rem", fontWeight: 700, color: "var(--text-primary)", marginBottom: "0.75rem", textTransform: "uppercase" }}>Security & Trust</div>
              <div style={{ display: "flex", flexDirection: "column", gap: "0.5rem", fontSize: "0.875rem", color: "var(--text-secondary)" }}>
                <span>🔒 256-bit SSL Secure</span>
                <span>⚡ Powered by Razorpay</span>
                <span>🛡️ PCI-DSS Compliant</span>
                <span>⏱️ 72-Hour Response SLA</span>
              </div>
            </div>
          </div>
        </div>

        <div className="footer-copyright">
          © {new Date().getFullYear()} FFA FINSERV. All rights reserved.
        </div>
      </div>
    </footer>
  );
}
