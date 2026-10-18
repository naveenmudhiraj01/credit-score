"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState } from "react";

export function Navbar() {
  const pathname = usePathname();
  const [mobileOpen, setMobileOpen] = useState(false);

  if (pathname?.startsWith("/admin") || pathname?.startsWith("/dashboard")) {
    return null;
  }

  const isActive = (path: string) => {
    if (path === "/" && pathname === "/") return true;
    if (path !== "/" && pathname.startsWith(path)) return true;
    return false;
  };

  return (
    <header className="navbar">
      <div className="container navbar-container">
        <Link href="/" className="navbar-brand">
          <div className="brand-icon">
            <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" />
              <polyline points="9 12 11 14 15 10" />
            </svg>
          </div>
          <div className="brand-title">
            <span className="brand-title-main">FFA FINSERV</span>
            <span className="brand-title-sub">Financial Assistance Services</span>
          </div>
        </Link>

        <nav className="navbar-links">
          <Link href="/" className={`nav-link ${isActive("/") ? "active" : ""}`}>
            Home
          </Link>
          <Link href="/register" className={`nav-link ${isActive("/register") ? "active" : ""}`}>
            Apply for Service
          </Link>
          <Link href="/my-orders" className={`nav-link ${isActive("/my-orders") ? "active" : ""}`}>
            My Orders
          </Link>
        </nav>

        <div className="navbar-actions">
          <Link href="/register" className="btn btn-primary btn-sm">
            Apply Now
          </Link>
        </div>
      </div>
    </header>
  );
}
