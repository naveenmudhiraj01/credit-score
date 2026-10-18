import type { Metadata, Viewport } from "next";
import Script from "next/script";
import "./globals.css";
import "./styles/dashboard.css";
import "./styles/AdminLogin.css";
import { Navbar } from "@/components/Navbar";
import { Footer } from "@/components/Footer";

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
};

export const metadata: Metadata = {
  title: "FFA FINSERV — Financial Assistance Services",
  description: "Apply for Instant Loan Assistance in Less Than 30 Seconds with FFA FINSERV. Low Credit Score? No Problem!",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <head>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
      </head>
      <body>
        <div className="page-wrapper">
          <Navbar />
          <main className="main-content">{children}</main>
          <Footer />
        </div>
        <Script src="https://checkout.razorpay.com/v1/checkout.js" strategy="lazyOnload" />
      </body>
    </html>
  );
}
