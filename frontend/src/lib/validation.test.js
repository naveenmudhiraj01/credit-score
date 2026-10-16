import test from "node:test";
import assert from "node:assert/strict";
import { parseMobile, validateConsent, validateDob, validateEmail, validateName, validateRegistration } from "./validation.js";

test("name: accepts real-world names", () => {
  for (const n of ["Anil Kumar", "K. Ramesh", "Anne-Marie O’Neil", "D'Souza", "अनिल कुमार", "José  Álvarez", "Li"]) {
    assert.equal(validateName(n), "", n);
  }
});
test("name: rejects bad names", () => {
  for (const n of ["", "   ", "A", "1234", "John3", "John_Doe", "@@", "-Anil", "x".repeat(121), "A."]) {
    assert.notEqual(validateName(n), "", JSON.stringify(n));
  }
});

test("email: accepts valid", () => {
  for (const e of ["a@b.co", "first.last+tag@sub.example.com", "  user@example.in  ", "o'brien@example.org"]) {
    assert.equal(validateEmail(e), "", e);
  }
});
test("email: rejects invalid", () => {
  for (const e of ["", "plain", "a@b", "a@b.", "@b.com", "a@@b.com", "a b@c.com", ".a@b.com", "a.@b.com", "a..b@c.com",
    "a@-b.com", "a@b-.com", "a@b..com", "a@b.c", "a@b.123", "a@b.com,c@d.com", `${"x".repeat(65)}@b.com`, `a@${"x".repeat(190)}.com`]) {
    assert.notEqual(validateEmail(e), "", e);
  }
});

test("mobile: Indian formats normalise to +91XXXXXXXXXX", () => {
  for (const m of ["9876543210", "09876543210", "919876543210", "+919876543210", "+91 98765 43210", "(+91) 98765-43210", " 98765 43210 "]) {
    assert.deepEqual(parseMobile(m), { value: "+919876543210", error: "" }, m);
  }
});
test("mobile: international only with +", () => {
  assert.deepEqual(parseMobile("+14155552671"), { value: "+14155552671", error: "" });
  assert.deepEqual(parseMobile("+44 7911 123456"), { value: "+447911123456", error: "" });
  assert.notEqual(parseMobile("14155552671").error, "");
});
test("mobile: rejects invalid", () => {
  for (const m of ["", "12345", "5876543210", "0000000000", "98765432101", "abc9876543210", "98765-4321x", "+91 12345 67890", "+0123456789", "98+76543210", "+1234567", "+1234567890123456"]) {
    assert.notEqual(parseMobile(m).error, "", m);
  }
});

test("dob: accepts valid adult dates and rejects invalid or underage", () => {
  assert.equal(validateDob("15/05/1998"), "");
  assert.equal(validateDob("1998-05-15"), "");
  assert.notEqual(validateDob(""), "");
  assert.notEqual(validateDob("31/02/1998"), "");
  assert.notEqual(validateDob("15/05/2030"), "");
  // Underage
  assert.notEqual(validateDob("15/05/2020"), "");
});

test("consent", () => {
  assert.equal(validateConsent(true), "");
  assert.notEqual(validateConsent(false), "");
});

test("whole form: collects every error and normalises values", () => {
  const bad = validateRegistration({ name: "", email: "x", mobile: "1", consent: false });
  assert.deepEqual(Object.keys(bad.errors), ["name", "email", "mobile", "consent"]);
  const ok = validateRegistration({ name: "  Anil   Kumar ", email: " a@b.com ", mobile: "98765 43210", consent: true });
  assert.deepEqual(ok.errors, {});
  assert.deepEqual(ok.values, { name: "Anil Kumar", email: "a@b.com", mobile: "+919876543210" });
});
