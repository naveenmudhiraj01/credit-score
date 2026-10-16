import OrdersPanel from "./OrdersPanel";

const FIXED_PAID = { status: "PAID" };

export function OrdersPage() {
  return (
    <div>
      <h1 className="page-title">Orders</h1>
      <OrdersPanel />
    </div>
  );
}

export function PaymentsPage() {
  return (
    <div>
      <h1 className="page-title">Payments</h1>
      <OrdersPanel fixed={FIXED_PAID} emptyText="No successful payments yet." />
    </div>
  );
}
