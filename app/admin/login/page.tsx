"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";

export default function AdminLoginPage() {
  const router = useRouter();
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!password.trim()) {
      setError("Please enter the admin password.");
      return;
    }

    setLoading(true);
    setError(null);

    try {
      const res = await fetch("/api/admin/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ password: password.trim() }),
      });

      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error?.message || "Invalid credentials.");
      }

      router.push("/admin");
      router.refresh();
    } catch (err: any) {
      setError(err.message || "Failed to log in.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div style={{ minHeight: "80vh", display: "flex", alignItems: "center", justifyContent: "center", padding: "2rem 1.5rem" }}>
      <div
        className="card-elevated"
        style={{
          display: "grid",
          gridTemplateColumns: "1fr 1.2fr",
          maxWidth: "880px",
          width: "100%",
          borderRadius: "var(--radius-xl)",
          overflow: "hidden",
          background: "white",
        }}
      >
        {/* Left Branded Panel (matches project.png Screen 9) */}
        <div
          style={{
            background: "linear-gradient(135deg, #0f172a 0%, #1e293b 100%)",
            color: "white",
            padding: "3rem 2.5rem",
            display: "flex",
            flexDirection: "column",
            justifyContent: "space-between",
          }}
        >
          <div>
            <div
              style={{
                width: "48px",
                height: "48px",
                borderRadius: "12px",
                background: "var(--color-primary)",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                marginBottom: "2rem",
                color: "white",
              }}
            >
              <svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" />
              </svg>
            </div>
            <h2 style={{ fontSize: "1.75rem", fontWeight: 800, color: "white", lineHeight: 1.25, marginBottom: "1rem" }}>
              Customer Onboarding &amp; Payment Verification
            </h2>
            <p style={{ color: "#94a3b8", fontSize: "0.9375rem" }}>
              Access the administrative operations portal for live orders, automated email verification, and Google Sheets sync logs.
            </p>
          </div>

          <div style={{ fontSize: "0.8125rem", color: "#64748b", display: "flex", gap: "0.75rem", alignItems: "center" }}>
            <span>Secure</span>
            <span>•</span>
            <span>Reliable</span>
            <span>•</span>
            <span>Transparent</span>
          </div>
        </div>

        {/* Right Login Form (matches project.png Screen 9) */}
        <div style={{ padding: "3.5rem 3rem", display: "flex", flexDirection: "column", justifyContent: "center" }}>
          <div style={{ marginBottom: "2rem" }}>
            <h1 style={{ fontSize: "1.75rem", fontWeight: 800, marginBottom: "0.5rem" }}>
              Admin Login
            </h1>
            <p style={{ color: "var(--text-muted)", fontSize: "0.875rem" }}>
              Sign in to manage and audit customer transactions
            </p>
          </div>

          {error && (
            <div style={{ background: "var(--color-danger-bg)", border: "1px solid var(--color-danger-border)", color: "var(--color-danger-text)", padding: "0.875rem", borderRadius: "var(--radius-md)", marginBottom: "1.5rem", fontSize: "0.875rem" }}>
              {error}
            </div>
          )}

          <form onSubmit={handleLogin}>
            <div className="form-group">
              <label className="form-label" htmlFor="adminPassword">
                Admin Password
              </label>
              <div style={{ position: "relative" }}>
                <input
                  id="adminPassword"
                  type={showPassword ? "text" : "password"}
                  className="form-input"
                  placeholder="Enter administrator password..."
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  disabled={loading}
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  style={{
                    position: "absolute",
                    right: "12px",
                    top: "50%",
                    transform: "translateY(-50%)",
                    background: "none",
                    border: "none",
                    cursor: "pointer",
                    fontSize: "0.8125rem",
                    color: "var(--text-muted)",
                  }}
                >
                  {showPassword ? "Hide" : "Show"}
                </button>
              </div>
            </div>

            <div style={{ marginTop: "1.75rem" }}>
              <button
                type="submit"
                className="btn btn-primary btn-full btn-lg"
                disabled={loading}
              >
                {loading ? "Authenticating..." : "Login to Admin Panel"}
              </button>
            </div>
          </form>

          <div style={{ marginTop: "2rem", textAlign: "center" }}>
            <Link href="/" style={{ fontSize: "0.8125rem", color: "var(--color-primary)", fontWeight: 600 }}>
              ← Return to Customer Portal
            </Link>
          </div>
        </div>
      </div>
    </div>
  );
}
