import { Link } from "react-router-dom";
import CustomerShell from "../components/CustomerShell";

export default function NotFound() {
  return (
    <CustomerShell header>
      <div className="px-6 py-14 text-center">
        <p className="text-4xl font-bold text-brand">404</p>
        <h1 className="mt-3 text-lg font-bold text-slate-900">Page not found</h1>
        <p className="mt-1 text-sm text-slate-500">The link you followed may be broken.</p>
        <Link to="/" className="btn-primary mt-6">Go to home</Link>
      </div>
    </CustomerShell>
  );
}
