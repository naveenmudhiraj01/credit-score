import raw from "./products.json";

export interface Product {
  slug: string;
  name: string;
  description: string;
  category: string;
  stock?: number;
  rating?: number;
  price?: number;
  image?: string;
  sellerName?: string;
}

// Customer-facing display names
export const PRODUCT_DISPLAY_NAMES: Record<string, string> = {
  "product-a": "Loan Assistance Service",
};

export const ACTIVE_PRODUCTS: Product[] = (raw as Product[])
  .filter((p) => p.slug === "product-a")
  .map((p) => ({
    ...p,
    name: PRODUCT_DISPLAY_NAMES[p.slug] || p.name,
    description: "Apply for Instant Loan Assistance in Less Than 30 Seconds*",
  }));

export const ALL_PRODUCTS: Product[] = raw as Product[];
export const PRODUCTS = ACTIVE_PRODUCTS;
export const DEFAULT_PRODUCT = "product-a";
export const CATEGORIES = [...new Set(PRODUCTS.map((p) => p.category))];

export const findProduct = (slug: string | null | undefined): Product | undefined => {
  if (!slug) return undefined;
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
export const rememberProduct = (slug: string) => {
  try {
    sessionStorage.setItem(PENDING_KEY, slug);
  } catch {
    /* private mode */
  }
};

export const recallProduct = (): string | null => {
  try {
    return sessionStorage.getItem(PENDING_KEY);
  } catch {
    return null;
  }
};

/** Remember the selected product and continue to the in-app customer details form. */
export function startPurchase(
  product: Product,
  navigate: ((path: string) => void) | { push: (path: string) => void }
) {
  rememberProduct(product.slug);
  const target = `/redirect?product=${encodeURIComponent(product.slug)}`;
  if (typeof navigate === "function") {
    navigate(target);
  } else if (navigate && typeof navigate.push === "function") {
    navigate.push(target);
  }
}
