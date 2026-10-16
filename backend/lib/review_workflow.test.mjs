import assert from "node:assert/strict";
import test from "node:test";
import nodemailer from "nodemailer";
import crypto from "node:crypto";
import { planTransition, allowedActions, outcomeEmailTypeFor, cleanMessage, cleanActor } from "./reviewWorkflow.ts";
import { buildTimeline } from "./orderTimeline.ts";
import { applyReviewAction } from "./reviewActions.ts";
import { createFailureLimiter } from "./rateLimit.ts";
import { formatDashboardOrder, isAuthorizedForOrder, createOrderToken, verifyOrderToken } from "./orderAuth.ts";
import { presentEmailStatus } from "./emailStatus.ts";
import { prisma } from "./prisma.ts";
import { sendReviewOutcomeEmailOnce } from "./payments.ts";

// ---------------------------------------------------------------- state machine
test("Only explicit admin actions move the review; the allowed actions per state are exact", () => {
  assert.deepEqual(allowedActions("PENDING_REVIEW"), ["start"]);
  assert.deepEqual(allowedActions("IN_REVIEW"), ["approve", "reject", "request_info"]);
  assert.deepEqual(allowedActions("INFO_REQUESTED"), ["resume"]);
  for (const s of ["APPROVED", "REJECTED", "RESPONDED", "CLOSED", "NOT_APPLICABLE"]) assert.deepEqual(allowedActions(s), [], s);
});

test("Invalid transitions are rejected with 409 and no state change is planned", () => {
  const bad = [
    ["PENDING_REVIEW", "approve"], ["PENDING_REVIEW", "reject", "x"], ["PENDING_REVIEW", "request_info", "x"],
    ["IN_REVIEW", "start"], ["IN_REVIEW", "resume"], ["APPROVED", "reject", "x"], ["REJECTED", "approve"],
    ["INFO_REQUESTED", "approve"], ["RESPONDED", "start"], ["NOT_APPLICABLE", "start"],
  ];
  for (const [from, action, msg] of bad) {
    const p = planTransition("PAID", from, action, msg);
    assert.equal(p.ok, false, `${from} -> ${action}`);
    assert.equal(p.httpStatus, 409);
    assert.equal(p.code, "INVALID_TRANSITION");
  }
});

test("Unknown actions, unpaid orders and missing required messages are rejected", () => {
  assert.equal(planTransition("PAID", "IN_REVIEW", "delete").code, "INVALID_ACTION");
  assert.equal(planTransition("PAID", "IN_REVIEW", undefined).code, "INVALID_ACTION");
  for (const s of ["CREATED", "PENDING", "FAILED"]) {
    const p = planTransition(s, "PENDING_REVIEW", "start");
    assert.equal(p.code, "NOT_PAID");
    assert.equal(p.httpStatus, 409);
  }
  assert.equal(planTransition("PAID", "IN_REVIEW", "reject", "   ").code, "MESSAGE_REQUIRED");
  assert.equal(planTransition("PAID", "IN_REVIEW", "request_info").code, "MESSAGE_REQUIRED");
  assert.equal(planTransition("PAID", "IN_REVIEW", "approve").ok, true); // message optional for approval
});

test("Valid plans name the correct target status and outcome email", () => {
  const ok = (from, action, msg) => planTransition("PAID", from, action, msg);
  assert.deepEqual([ok("PENDING_REVIEW", "start").to, ok("PENDING_REVIEW", "start").email], ["IN_REVIEW", null]);
  assert.deepEqual([ok("IN_REVIEW", "approve").to, ok("IN_REVIEW", "approve").email], ["APPROVED", "REVIEW_APPROVED"]);
  assert.deepEqual([ok("IN_REVIEW", "reject", "r").to, ok("IN_REVIEW", "reject", "r").email], ["REJECTED", "REVIEW_REJECTED"]);
  assert.deepEqual([ok("IN_REVIEW", "request_info", "m").to, ok("IN_REVIEW", "request_info", "m").email], ["INFO_REQUESTED", "REVIEW_INFO_REQUESTED"]);
  assert.deepEqual([ok("INFO_REQUESTED", "resume").to, ok("INFO_REQUESTED", "resume").email], ["IN_REVIEW", null]);
  assert.equal(outcomeEmailTypeFor("IN_REVIEW"), null);
});

test("Messages and reviewer labels are sanitised and bounded", () => {
  assert.equal(cleanMessage("  hi\u0000 there\u0007 "), "hi there");
  assert.equal(cleanMessage("x".repeat(5000)).length, 2000);
  assert.equal(cleanMessage(42), "");
  assert.equal(cleanActor("  Asha\r\nBcc: x "), "AshaBcc: x");
  assert.equal(cleanActor(""), "admin");
  assert.equal(cleanActor(undefined), "admin");
});

// ---------------------------------------------------------------- transactional service (in-memory fake DB)
function fakeDb(initial) {
  const order = { id: "o1", receipt: "ORD20261014TEST01", status: "PAID", reviewStatus: "PENDING_REVIEW", customerEmail: "c@example.com", ...initial };
  const notifications = new Map();
  let txDepth = 0;
  const db = {
    order, notifications,
    paymentOrder: {
      findUnique: async () => ({ ...order }),
      updateMany: async ({ where, data }) => {
        if (order.id !== where.id || order.status !== where.status || order.reviewStatus !== where.reviewStatus) return { count: 0 };
        Object.assign(order, data);
        return { count: 1 };
      },
    },
    emailNotification: {
      upsert: async ({ where, create, update }) => {
        const key = `${where.orderId_emailType.orderId}:${where.orderId_emailType.emailType}`;
        const row = notifications.get(key);
        if (row) Object.assign(row, update); else notifications.set(key, { ...create });
        return notifications.get(key);
      },
    },
    $transaction: async (fn) => {
      // snapshot/rollback so a failed compare-and-set leaves nothing behind
      const snap = [JSON.stringify(order), JSON.stringify([...notifications])];
      txDepth++;
      try { return await fn(db); } catch (e) { Object.assign(order, JSON.parse(snap[0])); notifications.clear(); for (const [k, v] of JSON.parse(snap[1])) notifications.set(k, v); throw e; } finally { txDepth--; }
    },
  };
  return db;
}
const NOW = new Date("2026-10-14T10:00:00Z");

test("start review: opening/reading never starts it; only the explicit action does, and it records who/when", async () => {
  const db = fakeDb();
  assert.equal(db.order.reviewStatus, "PENDING_REVIEW"); // nothing has happened yet
  const r = await applyReviewAction(db, { receipt: db.order.receipt, action: "start", actor: "Asha", now: NOW });
  assert.equal(r.ok, true);
  assert.equal(db.order.reviewStatus, "IN_REVIEW");
  assert.equal(db.order.reviewStartedBy, "Asha");
  assert.equal(db.order.reviewStartedAt, NOW);
  assert.equal(db.notifications.size, 0); // starting sends no email
});

test("approve / reject / request_info persist the decision and queue exactly one PENDING notification atomically", async () => {
  for (const [action, to, type, msg] of [["approve", "APPROVED", "REVIEW_APPROVED", ""], ["reject", "REJECTED", "REVIEW_REJECTED", "Not eligible"], ["request_info", "INFO_REQUESTED", "REVIEW_INFO_REQUESTED", "Send PAN card"]]) {
    const db = fakeDb({ reviewStatus: "IN_REVIEW" });
    const r = await applyReviewAction(db, { receipt: db.order.receipt, action, message: msg, actor: "Asha", now: NOW });
    assert.equal(r.ok, true, action);
    assert.equal(db.order.reviewStatus, to);
    assert.equal(db.order.teamRespondedBy, "Asha");
    assert.equal(db.order.teamRespondedAt, NOW);
    assert.equal(db.order.teamResponseNotes, msg || null);
    assert.equal(db.notifications.size, 1);
    const n = db.notifications.get(`o1:${type}`);
    assert.equal(n.status, "PENDING"); // decision and notification are separate facts
    assert.equal(n.recipient, "c@example.com");
  }
});

test("Approving does not depend on payment alone: PENDING_REVIEW cannot be approved, unpaid cannot be actioned", async () => {
  const fresh = fakeDb();
  assert.equal((await applyReviewAction(fresh, { receipt: fresh.order.receipt, action: "approve" })).code, "INVALID_TRANSITION");
  assert.equal(fresh.order.reviewStatus, "PENDING_REVIEW");
  const unpaid = fakeDb({ status: "PENDING", reviewStatus: "NOT_APPLICABLE" });
  assert.equal((await applyReviewAction(unpaid, { receipt: unpaid.order.receipt, action: "start" })).code, "NOT_PAID");
  const missing = fakeDb();
  missing.paymentOrder.findUnique = async () => null;
  assert.equal((await applyReviewAction(missing, { receipt: "ORDNOPE000000", action: "start" })).httpStatus, 404);
});

test("Double submit / concurrent actions: exactly one wins, the other gets 409 and writes nothing", async () => {
  const db = fakeDb({ reviewStatus: "IN_REVIEW" });
  const [a, b] = await Promise.all([
    applyReviewAction(db, { receipt: db.order.receipt, action: "approve", now: NOW }),
    applyReviewAction(db, { receipt: db.order.receipt, action: "reject", message: "no", now: NOW }),
  ]);
  assert.equal([a, b].filter((x) => x.ok).length, 1);
  assert.equal([a, b].filter((x) => !x.ok && x.httpStatus === 409).length, 1);
  assert.equal(db.notifications.size, 1); // never two outcome emails for one order
  // stale read, then someone else changes state before our write: compare-and-set loses cleanly
  const stale = fakeDb({ reviewStatus: "IN_REVIEW" });
  const realFind = stale.paymentOrder.findUnique;
  stale.paymentOrder.findUnique = async (a2) => { const o = await realFind(a2); stale.order.reviewStatus = "APPROVED"; return o; };
  const lost = await applyReviewAction(stale, { receipt: stale.order.receipt, action: "reject", message: "no" });
  assert.deepEqual([lost.ok, lost.code], [false, "CONFLICT"]);
  assert.equal(stale.notifications.size, 0);
});

test("A second information request starts a fresh notification cycle (the old SENT state must not suppress it)", async () => {
  const db = fakeDb({ reviewStatus: "IN_REVIEW" });
  await applyReviewAction(db, { receipt: db.order.receipt, action: "request_info", message: "first" });
  Object.assign(db.notifications.get("o1:REVIEW_INFO_REQUESTED"), { status: "ACCEPTED", messageId: "<1@x>", sentAt: NOW, attemptCount: 1 });
  await applyReviewAction(db, { receipt: db.order.receipt, action: "resume" });
  assert.equal(db.order.reviewStatus, "IN_REVIEW");
  await applyReviewAction(db, { receipt: db.order.receipt, action: "request_info", message: "second" });
  const n = db.notifications.get("o1:REVIEW_INFO_REQUESTED");
  assert.deepEqual([n.status, n.messageId, n.sentAt, n.attemptCount], ["PENDING", null, null, 0]);
  assert.equal(db.order.teamResponseNotes, "second");
});

// ---------------------------------------------------------------- timeline
const T = (o, n) => buildTimeline({ status: "PAID", reviewStatus: "PENDING_REVIEW", paidAt: NOW, ...o }, n);
const states = (r) => r.steps.map((s) => s.state);

test("Timeline: payment states come from the persisted payment status only", () => {
  assert.deepEqual(states(T({ status: "CREATED", reviewStatus: "NOT_APPLICABLE" })), ["upcoming", "upcoming", "upcoming", "upcoming"]);
  assert.deepEqual(states(T({ status: "PENDING", reviewStatus: "NOT_APPLICABLE" })), ["current", "upcoming", "upcoming", "upcoming"]);
  assert.deepEqual(states(T({ status: "FAILED", reviewStatus: "NOT_APPLICABLE" })), ["failed", "upcoming", "upcoming", "upcoming"]);
  assert.deepEqual(states(T({})), ["done", "done", "upcoming", "upcoming"]); // paid + queued, review NOT started
});

test("Timeline: review step is 'current' only after an admin starts it; info request needs attention", () => {
  assert.deepEqual(states(T({ reviewStatus: "IN_REVIEW", reviewStartedAt: NOW })), ["done", "done", "current", "upcoming"]);
  assert.equal(T({ reviewStatus: "IN_REVIEW", reviewStartedAt: NOW }).steps[2].at, NOW.toISOString());
  assert.deepEqual(states(T({ reviewStatus: "INFO_REQUESTED" }, { emailType: "REVIEW_INFO_REQUESTED", status: "PENDING" })), ["done", "done", "attention", "current"]);
});

test("Timeline: last step mirrors the real notification state and never calls 'accepted' delivered", () => {
  const dec = { reviewStatus: "APPROVED", teamRespondedAt: NOW };
  const n = (status, extra) => ({ emailType: "REVIEW_APPROVED", status, ...extra });
  assert.deepEqual(states(T(dec, null)), ["done", "done", "done", "current"]);
  assert.deepEqual(states(T(dec, n("PENDING"))), ["done", "done", "done", "current"]);
  assert.deepEqual(states(T(dec, n("SENDING"))), ["done", "done", "done", "current"]);
  const acc = T(dec, n("ACCEPTED", { sentAt: NOW }));
  assert.equal(acc.steps[3].state, "accepted");
  assert.equal(acc.steps[3].label, "Customer email accepted");
  assert.equal(acc.steps[3].at, NOW.toISOString());
  assert.match(acc.steps[3].detail, /Inbox delivery is not confirmed/);
  assert.equal(acc.emailDelivery, "ACCEPTED");
  const del = T(dec, n("DELIVERED", { deliveredAt: NOW }));
  assert.equal(del.steps[3].state, "done");
  assert.equal(del.steps[3].label, "Customer email delivered");
  assert.equal(del.steps[3].at, NOW.toISOString());
  assert.equal(del.emailDelivery, "DELIVERED");
  const acceptedWithoutTimestamp = T(dec, n("ACCEPTED"));
  assert.equal(acceptedWithoutTimestamp.steps[3].state, "accepted");
  assert.equal(acceptedWithoutTimestamp.steps[3].at, null);
  assert.equal(T(dec, n("FAILED")).steps[3].state, "failed");
  assert.equal(T(dec, n("BOUNCED")).steps[3].state, "failed");
  // the review outcome itself is unaffected by an email failure
  assert.equal(T(dec, n("FAILED")).steps[2].state, "done");
  // a notification belonging to a different decision is ignored
  assert.equal(T({ reviewStatus: "REJECTED" }, n("DELIVERED")).emailDelivery, "PENDING");
});

test("Customer-safe email status mapping distinguishes send failure, delivery failure and missing details", () => {
  const failedAt = new Date("2026-10-15T06:57:00.000Z");
  const sendingFailure = presentEmailStatus({
    status: "FAILED",
    updatedAt: failedAt,
    errorDetails: "SMTP password=secret stack trace",
  });
  assert.equal(sendingFailure.label, "Email sending failed");
  assert.equal(sendingFailure.state, "failed");
  assert.equal(sendingFailure.at, failedAt.toISOString());
  assert.match(sendingFailure.detail, /couldn't send the email/);
  assert.doesNotMatch(sendingFailure.detail, /secret|SMTP|stack trace/);

  const deliveryFailure = presentEmailStatus({ status: "FAILED", sentAt: NOW, updatedAt: failedAt });
  assert.equal(deliveryFailure.label, "Email delivery failed");
  assert.equal(deliveryFailure.at, failedAt.toISOString());
  assert.match(deliveryFailure.detail, /later delivery failure/);

  const bounced = presentEmailStatus({ status: "BOUNCED", updatedAt: failedAt });
  assert.equal(bounced.label, "Email delivery failed");
  assert.equal(bounced.at, failedAt.toISOString());

  const noFailureTime = presentEmailStatus({ status: "FAILED" });
  assert.equal(noFailureTime.at, null);
  assert.equal(noFailureTime.timeLabel, "Failure recorded at");

  const unknown = presentEmailStatus({ status: "UNRECOGNIZED" });
  assert.equal(unknown.state, "unknown");
  assert.equal(unknown.at, null);
});

test("Timeline: legacy RESPONDED orders keep a neutral, non-delivered final step", () => {
  const r = T({ reviewStatus: "RESPONDED" });
  assert.deepEqual(states(r), ["done", "done", "done", "current"]);
  assert.doesNotMatch(r.steps[3].detail, /delivered/i);
});

// ---------------------------------------------------------------- dashboard payload + ownership
const ORDER = { receipt: "ORD20261014TEST01", product: "Product A", amount: 19900, currency: "INR", status: "PAID", razorpayPaymentId: "pay_1", paidAt: NOW, createdAt: NOW, customerName: "T", customerEmail: "customer@example.com", customerMobile: "9876543210", reviewStatus: "REJECTED", teamRespondedBy: "internal-admin", teamResponseNotes: "Not eligible", teamRespondedAt: NOW };

test("Dashboard payload carries the server timeline and the customer message, but no internal reviewer data", () => {
  const view = formatDashboardOrder(ORDER, { emailType: "REVIEW_REJECTED", status: "ACCEPTED", sentAt: NOW });
  assert.equal(view.timeline.length, 4);
  assert.equal(view.emailDelivery, "ACCEPTED");
  assert.equal(view.timeline[3].label, "Customer email accepted");
  assert.equal(view.timeline[3].state, "accepted");
  assert.equal(view.timeline[3].at, NOW.toISOString());
  assert.equal(view.customerMessage, "Not eligible");
  assert.equal(JSON.stringify(view).includes("internal-admin"), false);
  assert.equal(formatDashboardOrder({ ...ORDER, reviewStatus: "IN_REVIEW" }).customerMessage, null);
  assert.equal(formatDashboardOrder({ ...ORDER, status: "PENDING" }).reviewStatus, "NOT_APPLICABLE");
});

function fakeReq({ cookies = {}, headers = {} } = {}) {
  return { cookies: { get: (n) => (n in cookies ? { value: cookies[n] } : undefined) }, headers: { get: (n) => headers[n.toLowerCase()] ?? null } };
}

test("Ownership: a customer's token only opens their own order; admin session opens any; nothing else does", (t) => {
  const prev = { A: process.env.ADMIN_SESSION_SECRET, O: process.env.ORDER_SESSION_SECRET };
  process.env.ADMIN_SESSION_SECRET = "unit-test-admin-secret-0123456789abcdef";
  t.after(() => { for (const [k, v] of [["ADMIN_SESSION_SECRET", prev.A], ["ORDER_SESSION_SECRET", prev.O]]) v === undefined ? delete process.env[k] : (process.env[k] = v); });
  const mine = { receipt: "ORD20261014TEST01", customerEmail: "customer@example.com" };
  const theirs = { receipt: "ORD20261014OTHER1", customerEmail: "other@example.com" };
  const myToken = createOrderToken(mine.receipt, mine.customerEmail);
  assert.equal(isAuthorizedForOrder(fakeReq({ cookies: { [`order_token_${mine.receipt}`]: myToken } }), mine), true);
  assert.equal(isAuthorizedForOrder(fakeReq({ cookies: { [`order_token_${theirs.receipt}`]: myToken } }), theirs), false);
  assert.equal(isAuthorizedForOrder(fakeReq({ headers: { "x-order-token": myToken } }), theirs), false);
  assert.equal(isAuthorizedForOrder(fakeReq(), mine), false);
  assert.equal(isAuthorizedForOrder(fakeReq({ cookies: { admin_session: "garbage" } }), mine), false);
  const exp = String(Date.now() + 60_000);
  const adminTok = `${exp}.${crypto.createHmac("sha256", process.env.ADMIN_SESSION_SECRET).update(exp).digest("base64url")}`;
  assert.equal(isAuthorizedForOrder(fakeReq({ cookies: { admin_session: adminTok } }), theirs), true);
});

test("Production fails closed when no signing secret is configured (no public fallback secret)", (t) => {
  const keep = { A: process.env.ADMIN_SESSION_SECRET, O: process.env.ORDER_SESSION_SECRET, N: process.env.NODE_ENV };
  delete process.env.ADMIN_SESSION_SECRET; delete process.env.ORDER_SESSION_SECRET;
  t.after(() => { for (const [k, v] of [["ADMIN_SESSION_SECRET", keep.A], ["ORDER_SESSION_SECRET", keep.O], ["NODE_ENV", keep.N]]) v === undefined ? delete process.env[k] : (process.env[k] = v); });
  const devToken = createOrderToken("ORD20261014TEST01", "a@b.co"); // dev fallback still works for local development
  process.env.NODE_ENV = "production";
  assert.throws(() => createOrderToken("ORD20261014TEST01", "a@b.co"), /must be set in production/);
  assert.equal(verifyOrderToken("ORD20261014TEST01", "a@b.co", devToken), false);
});

// ---------------------------------------------------------------- rate limiter
test("Verification failure limiter blocks after the cap, expires, and resets on success", () => {
  const l = createFailureLimiter({ max: 3, windowMs: 1000 });
  for (let i = 0; i < 3; i++) { assert.equal(l.isBlocked("k", 0), false); l.recordFailure("k", 0); }
  assert.equal(l.isBlocked("k", 500), true);
  assert.equal(l.isBlocked("other", 500), false);
  assert.equal(l.isBlocked("k", 1500), false); // window elapsed
  l.recordFailure("k", 2000); l.reset("k");
  assert.equal(l.isBlocked("k", 2001), false);
});

// ---------------------------------------------------------------- outcome email: idempotency, failure, retry (patched prisma + SMTP)
function setUpOutcomeEmail(t, options = {}) {
  const ENV = ["SMTP_HOST", "SMTP_USER", "SMTP_PASS", "MAIL_FROM"];
  const prevEnv = new Map(ENV.map((k) => [k, process.env[k]]));
  Object.assign(process.env, { SMTP_HOST: "smtp.example.test", SMTP_USER: "sender@example.com", SMTP_PASS: "test-only-password", MAIL_FROM: "sender@example.com" });
  t.after(() => { for (const [k, v] of prevEnv) v === undefined ? delete process.env[k] : (process.env[k] = v); });
  const order = { id: "o1", receipt: "ORD20261014TEST01", status: "PAID", reviewStatus: options.reviewStatus ?? "APPROVED", customerEmail: "customer@example.com", product: "Product A", amount: 19900, teamResponseNotes: options.notes ?? "All good <b>x</b>", paidAt: NOW };
  const notifications = new Map([["o1:REVIEW_APPROVED", { id: "n1", orderId: "o1", emailType: "REVIEW_APPROVED", status: "PENDING", attemptCount: 0, updatedAt: new Date() }]]);
  const sent = [];
  const patch = (target, name, value) => { const prev = target[name]; target[name] = value; t.after(() => { target[name] = prev; }); };
  patch(prisma.paymentOrder, "findUnique", async () => order);
  patch(prisma.paymentOrder, "update", async ({ data }) => Object.assign(order, data));
  patch(prisma.emailNotification, "findFirst", async ({ where }) => notifications.get(`${where.orderId}:${where.emailType}`) ?? null);
  patch(prisma.emailNotification, "findUnique", async ({ where }) => [...notifications.values()].find((r) => r.id === where.id) ?? null);
  patch(prisma.emailNotification, "create", async ({ data }) => { const row = { id: `n${notifications.size + 1}`, ...data, updatedAt: new Date() }; notifications.set(`${data.orderId}:${data.emailType}`, row); return row; });
  patch(prisma.emailNotification, "update", async ({ where, data }) => { const row = [...notifications.values()].find((r) => r.id === where.id); Object.assign(row, data, { updatedAt: new Date() }); return row; });
  patch(prisma.emailNotification, "updateMany", async ({ where, data }) => {
    const row = [...notifications.values()].find((r) => r.id === where.id);
    if (!row || row.status !== where.status) return { count: 0 };
    if (where.updatedAt instanceof Date && row.updatedAt.getTime() !== where.updatedAt.getTime()) return { count: 0 };
    const { attemptCount, ...rest } = data;
    Object.assign(row, rest, { attemptCount: row.attemptCount + (attemptCount?.increment ?? 0), updatedAt: new Date() });
    return { count: 1 };
  });
  const orig = nodemailer.createTransport;
  let failNext = Boolean(options.failFirst);
  nodemailer.createTransport = () => ({ sendMail: async (m) => { sent.push(m); if (failNext) { failNext = false; throw new Error("connect ETIMEDOUT"); } return { messageId: `<${sent.length}@smtp.test>`, accepted: [m.to] }; } });
  t.after(() => { nodemailer.createTransport = orig; });
  return { order, notifications, sent };
}

test("Outcome email: SMTP success is stored as ACCEPTED (not DELIVERED) and a repeat call sends nothing", async (t) => {
  const { notifications, sent } = setUpOutcomeEmail(t);
  assert.equal(await sendReviewOutcomeEmailOnce("o1", "REVIEW_APPROVED"), "SENT");
  assert.equal(notifications.get("o1:REVIEW_APPROVED").status, "ACCEPTED");
  assert.equal(notifications.get("o1:REVIEW_APPROVED").deliveredAt, null);
  assert.equal(await sendReviewOutcomeEmailOnce("o1", "REVIEW_APPROVED"), "SENT"); // idempotent no-op
  assert.equal(await Promise.all([sendReviewOutcomeEmailOnce("o1", "REVIEW_APPROVED"), sendReviewOutcomeEmailOnce("o1", "REVIEW_APPROVED")]).then((r) => r.length), 2);
  assert.equal(sent.length, 1);
  assert.equal(sent[0].to, "customer@example.com");
  assert.match(sent[0].subject, /approved/i);
  assert.equal(sent[0].html.includes("<b>x</b>"), false); // admin text is escaped
});

test("Outcome email: a failure is recorded as FAILED without touching the review outcome; retry sends exactly once", async (t) => {
  const { order, notifications, sent } = setUpOutcomeEmail(t, { failFirst: true });
  assert.equal(await sendReviewOutcomeEmailOnce("o1", "REVIEW_APPROVED"), "FAILED");
  assert.equal(notifications.get("o1:REVIEW_APPROVED").status, "FAILED");
  assert.equal(order.reviewStatus, "APPROVED"); // decision stays
  assert.equal(await sendReviewOutcomeEmailOnce("o1", "REVIEW_APPROVED"), "SENT"); // retry
  assert.equal(notifications.get("o1:REVIEW_APPROVED").status, "ACCEPTED");
  assert.equal(await sendReviewOutcomeEmailOnce("o1", "REVIEW_APPROVED"), "SENT");
  assert.equal(sent.length, 2); // 1 failed attempt + 1 successful, never a duplicate after success
});

test("Outcome email: a stale retry for a decision that has since changed is skipped", async (t) => {
  const { sent } = setUpOutcomeEmail(t, { reviewStatus: "REJECTED" });
  assert.equal(await sendReviewOutcomeEmailOnce("o1", "REVIEW_APPROVED"), "SKIPPED");
  assert.equal(sent.length, 0);
});

test("Outcome email: invalid customer address and unpaid orders never report success", async (t) => {
  const a = setUpOutcomeEmail(t);
  a.order.customerEmail = "not-an-email";
  assert.equal(await sendReviewOutcomeEmailOnce("o1", "REVIEW_APPROVED"), "FAILED");
  assert.equal(a.sent.length, 0);
  const b = setUpOutcomeEmail(t);
  b.order.status = "PENDING";
  assert.equal(await sendReviewOutcomeEmailOnce("o1", "REVIEW_APPROVED"), "SKIPPED");
});
