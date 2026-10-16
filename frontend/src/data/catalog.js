import raw from "./products.json";

// Customer-facing display names
export const PRODUCT_DISPLAY_NAMES = {
  "product-a": "Loan Assistance Service",
};

// The active product's service fee is loaded from the public settings API.
export const ACTIVE_PRODUCTS = raw
  .filter((p) => p.slug === "product-a")
  .map((p) => ({
    ...p,
    name: PRODUCT_DISPLAY_NAMES[p.slug] || p.name,
    description: "Apply for Instant Loan Assistance in Less Than 30 Seconds*",
  }));

export const ALL_PRODUCTS = raw;
export const PRODUCTS = ACTIVE_PRODUCTS;
export const DEFAULT_PRODUCT = "product-a";
export const CATEGORIES = [...new Set(PRODUCTS.map((p) => p.category))];

export const findProduct = (slug) => {
  const active = ACTIVE_PRODUCTS.find((p) => p.slug === slug);
  if (active) return active;
  const legacy = ALL_PRODUCTS.find((p) => p.slug === slug);
  if (!legacy) return undefined;
  return {
    ...legacy,
    name: PRODUCT_DISPLAY_NAMES[legacy.slug] || legacy.name,
  };
};

const PENDING_KEY = "pendingProduct";
export const rememberProduct = (slug) => { try { sessionStorage.setItem(PENDING_KEY, slug); } catch { /* private mode */ } };
export const recallProduct = () => { try { return sessionStorage.getItem(PENDING_KEY); } catch { return null; } };

/** Remember the selected product and continue to the in-app customer details form. */
export function startPurchase(product, navigate) {
  rememberProduct(product.slug);
  navigate(`/redirect?product=${encodeURIComponent(product.slug)}`);
}
