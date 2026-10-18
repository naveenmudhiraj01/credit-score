"use client";

import OrdersPanel from "@/components/admin/OrdersPanel";

const FIXED_PAID = { status: "PAID" };

export default function AdminPaymentsPage() {
  return (
    <div>
      <h1 className="page-title">Payments</h1>
      <OrdersPanel fixed={FIXED_PAID} emptyText="No successful payments yet." />
    </div>
  );
}
