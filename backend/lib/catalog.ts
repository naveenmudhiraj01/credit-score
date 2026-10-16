export type CatalogProduct = Readonly<{
  id: string;
  name: string;
  amountPaise: number;
  currency: "INR";
}>;

export const CATALOG_PRODUCTS: readonly CatalogProduct[] = [
  { id: "product-a", name: "Product A", amountPaise: 19900, currency: "INR" },
  { id: "gaming-laptop-pro", name: "Gaming Laptop Pro", amountPaise: 129999, currency: "INR" },
  { id: "cotton-t-shirt-premium", name: "Cotton T-Shirt Premium", amountPaise: 2999, currency: "INR" },
  { id: "smart-watch-series-x", name: "Smart Watch Series X", amountPaise: 29999, currency: "INR" },
  { id: "gold-necklace-18k", name: "Gold Necklace 18k", amountPaise: 89999, currency: "INR" },
  { id: "wireless-headphones", name: "Wireless Headphones", amountPaise: 14999, currency: "INR" },
  { id: "iphone-15-pro-max", name: "iPhone 15 Pro Max", amountPaise: 119999, currency: "INR" },
  { id: "macbook-air-m3", name: "MacBook Air M3", amountPaise: 109999, currency: "INR" },
  { id: "samsung-4k-tv-55", name: 'Samsung 4K TV 55"', amountPaise: 69999, currency: "INR" },
  { id: "nike-air-max-sneakers", name: "Nike Air Max Sneakers", amountPaise: 12999, currency: "INR" },
  { id: "levi-s-denim-jacket", name: "Levi's Denim Jacket", amountPaise: 8999, currency: "INR" },
  { id: "adidas-ultraboost-shoes", name: "Adidas Ultraboost Shoes", amountPaise: 17999, currency: "INR" },
  { id: "ray-ban-sunglasses", name: "Ray-Ban Sunglasses", amountPaise: 14999, currency: "INR" },
  { id: "rolex-submariner-watch", name: "Rolex Submariner Watch", amountPaise: 899999, currency: "INR" },
  { id: "diamond-earrings", name: "Diamond Earrings", amountPaise: 249999, currency: "INR" },
  { id: "playstation-5-console", name: "PlayStation 5 Console", amountPaise: 49999, currency: "INR" },
  { id: "canon-eos-r5-camera", name: "Canon EOS R5 Camera", amountPaise: 389999, currency: "INR" },
  { id: "gucci-leather-handbag", name: "Gucci Leather Handbag", amountPaise: 189999, currency: "INR" },
  { id: "dyson-vacuum-cleaner", name: "Dyson Vacuum Cleaner", amountPaise: 59999, currency: "INR" },
  { id: "kitchenaid-stand-mixer", name: "KitchenAid Stand Mixer", amountPaise: 37999, currency: "INR" },
  { id: "peloton-bike", name: "Peloton Bike", amountPaise: 249599, currency: "INR" },
  { id: "yeti-cooler-45qt", name: "Yeti Cooler 45qt", amountPaise: 29999, currency: "INR" },
  { id: "nintendo-switch-oled", name: "Nintendo Switch OLED", amountPaise: 34999, currency: "INR" },
  { id: "sony-wh-1000xm5-headphones", name: "Sony WH-1000XM5 Headphones", amountPaise: 39999, currency: "INR" },
  { id: "apple-watch-ultra-2", name: "Apple Watch Ultra 2", amountPaise: 79999, currency: "INR" },
  { id: "tesla-model-3-toy-car", name: "Tesla Model 3 Toy Car", amountPaise: 2499, currency: "INR" },
  { id: "lego-creator-set", name: "LEGO Creator Set", amountPaise: 14999, currency: "INR" },
  { id: "instant-pot-duo-7-in-1", name: "Instant Pot Duo 7-in-1", amountPaise: 8999, currency: "INR" },
  { id: "breville-espresso-machine", name: "Breville Espresso Machine", amountPaise: 69999, currency: "INR" },
  { id: "patagonia-fleece-jacket", name: "Patagonia Fleece Jacket", amountPaise: 14999, currency: "INR" },
  { id: "gopro-hero11-silver", name: "GoPro HERO11 Silver", amountPaise: 29999, currency: "INR" },
];

const productsById = new Map(CATALOG_PRODUCTS.map((product) => [product.id, product]));

export function findProduct(id: unknown): CatalogProduct | undefined {
  return typeof id === "string" ? productsById.get(id) : undefined;
}

export const PRODUCT_DISPLAY_NAMES: Readonly<Record<string, string>> = {
  "product-a": "Loan Assistance Service",
};

export const ACTIVE_CATALOG_PRODUCT_IDS: readonly string[] = ["product-a"];

export const DEFAULT_SERVICE_FEE_PAISE = 19900;
export const MIN_SERVICE_FEE_PAISE = 100; // ₹1.00
export const MAX_SERVICE_FEE_PAISE = 5000000; // ₹50,000.00
export const CONSENT_VERSION = "v1.0-loan-verification-consent";

export const MANDATORY_CONSENT_TEXT =
  "I hereby declare and accept the Terms and Conditions. The service fee is non-refundable, as it is used to process my application, including credit checks and necessary verifications, even if the loan is not approved.";

export function getConsentText(feePaise: number): string {
  const rupees = Math.round(feePaise / 100);
  return `I hereby declare and accept the Terms and Conditions. The service fee (₹${rupees}) is non-refundable, as it is used to process my application, including credit checks and necessary verifications, even if the loan is not approved.`;
}

export function getProductDisplayName(productId: unknown): string | undefined {
  if (typeof productId === "string" && PRODUCT_DISPLAY_NAMES[productId]) {
    return PRODUCT_DISPLAY_NAMES[productId];
  }
  const product = findProduct(productId);
  return product?.name;
}

/** Resolves product dynamically applying the active service fee if it's product-a */
export function resolveProductWithFee(productOrId: CatalogProduct | string | unknown, feePaise?: number | null): CatalogProduct | undefined {
  const product = typeof productOrId === "string" ? findProduct(productOrId) : (productOrId as CatalogProduct);
  if (!product) return undefined;
  if (product.id === "product-a" && typeof feePaise === "number" && Number.isSafeInteger(feePaise) && feePaise >= MIN_SERVICE_FEE_PAISE && feePaise <= MAX_SERVICE_FEE_PAISE) {
    return {
      ...product,
      amountPaise: feePaise,
    };
  }
  return product;
}

