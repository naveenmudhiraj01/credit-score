import test from "node:test";
import assert from "node:assert/strict";
import { parseServiceFeeRupees } from "./serviceFee.js";

test("customer fee display reads the current fee from the public settings response", () => {
  assert.equal(parseServiceFeeRupees({
    ok: true,
    serviceFeeRupees: 299,
    feeRupees: 299,
    feePaise: 29900,
    settings: { serviceFeeRupees: 299 },
  }), 299);
});

test("customer fee display supports nested settings and rejects missing or invalid amounts", () => {
  assert.equal(parseServiceFeeRupees({ settings: { feeRupees: 299 } }), 299);
  assert.equal(parseServiceFeeRupees({ feeRupees: 0 }), null);
  assert.equal(parseServiceFeeRupees({ feeRupees: 299.5 }), null);
  assert.equal(parseServiceFeeRupees({}), null);
});
