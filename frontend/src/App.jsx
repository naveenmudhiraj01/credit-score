import { Navigate, Route, Routes } from "react-router-dom";
import ProductPage from "./pages/ProductPage";
import ProductsPage from "./pages/ProductsPage";
import RedirectPage from "./pages/RedirectPage";
import { FailedPage, OrderPage, PendingPage, SuccessPage } from "./pages/PaymentResult";
import NotFound from "./pages/NotFound";
import CustomerDashboard from "./pages/CustomerDashboard";
import AdminLogin from "./pages/admin/AdminLogin";
import AdminLayout from "./pages/admin/AdminLayout";
import Dashboard from "./pages/admin/Dashboard";
import { OrdersPage, PaymentsPage } from "./pages/admin/OrdersPages";
import Customers from "./pages/admin/Customers";
import SheetsPage from "./pages/admin/SheetsPage";
import SettingsPage from "./pages/admin/SettingsPage";

export default function App() {
  return (
    <Routes>
      {/* Customer journey */}
      <Route path="/" element={<Navigate to="/products" replace />} />
      <Route path="/products" element={<ProductsPage />} />
      <Route path="/products/:slug" element={<ProductPage />} />
      <Route path="/redirect" element={<RedirectPage />} />
      <Route path="/payment-success" element={<SuccessPage />} />
      <Route path="/payment-pending" element={<PendingPage />} />
      <Route path="/payment-failed" element={<FailedPage />} />
      <Route path="/order/:id" element={<OrderPage />} />
      <Route path="/dashboard" element={<CustomerDashboard />} />

      {/* Admin */}
      <Route path="/admin/login" element={<Navigate to="/admin" replace />} />
      <Route path="/admin" element={<AdminLayout />}>
        <Route index element={<Dashboard />} />
        <Route path="orders" element={<OrdersPage />} />
        <Route path="payments" element={<PaymentsPage />} />
        <Route path="customers" element={<Customers />} />
        <Route path="sheets" element={<SheetsPage />} />
        <Route path="settings" element={<SettingsPage />} />
      </Route>

      {/* /product-a, /product-b … (static routes above take priority) */}
      <Route path="/:slug" element={<ProductPage />} />
      <Route path="*" element={<NotFound />} />
    </Routes>
  );
}
