import assert from "node:assert/strict";
import test from "node:test";
import { CATALOG_PRODUCTS, findProduct } from "./catalog.ts";

test("catalog has unique products with server-side INR prices in paise", () => {
  const ids = CATALOG_PRODUCTS.map((product) => product.id);
  assert.equal(CATALOG_PRODUCTS.length, 31);
  assert.equal(new Set(ids).size, ids.length);
  for (const product of CATALOG_PRODUCTS) {
    assert.ok(product.id);
    assert.ok(product.name);
    assert.equal(product.currency, "INR");
    assert.ok(Number.isSafeInteger(product.amountPaise) && product.amountPaise > 0);
  }
});

test("catalog uses the displayed Product A and gaming laptop prices", () => {
  assert.deepEqual(findProduct("product-a"), {
    id: "product-a",
    name: "Product A",
    amountPaise: 19900,
    currency: "INR",
  });
  assert.equal(findProduct("gaming-laptop-pro")?.amountPaise, 129999);
});

test("unknown or non-string product IDs do not resolve", () => {
  assert.equal(findProduct("not-a-product"), undefined);
  assert.equal(findProduct(undefined), undefined);
});
