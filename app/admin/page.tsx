"use client";

import OrdersPanel from "@/components/admin/OrdersPanel";

export default function AdminDashboardPage() {
  return (
    <div>
      <h1 className="page-title">Dashboard</h1>
      <OrdersPanel showStats />
    </div>
  );
}
