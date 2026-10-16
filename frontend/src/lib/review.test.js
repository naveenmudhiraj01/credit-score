import test from "node:test";
import assert from "node:assert/strict";
import { POLL_INTERVAL_MS, countdown, formatCountdown, maskEmail, pollIntervalMs, reviewDeadline, timelineSteps } from "./review.js";

const paidAt = "2026-10-10T08:00:00.000Z";
const H = 3600 * 1000;

test("deadline: persisted value wins, else paidAt+72h, never 'now'", () => {
  assert.equal(reviewDeadline({ paidAt, reviewDeadline: "2026-10-14T00:00:00Z" }).toISOString(), "2026-10-14T00:00:00.000Z");
  assert.equal(reviewDeadline({ paidAt }).toISOString(), "2026-10-13T08:00:00.000Z");
  assert.equal(reviewDeadline({}), null);
  assert.equal(reviewDeadline({ paidAt: "garbage" }), null);
  // same input -> same output regardless of when evaluated (refresh-stable)
  assert.equal(reviewDeadline({ paidAt }).getTime(), reviewDeadline({ paidAt }).getTime());
});

test("countdown", () => {
  const d = new Date(paidAt).getTime() + 72 * H;
  const c = countdown(new Date(d), d - (5 * H + 30 * 60000));
  assert.deepEqual([c.overdue, c.days, c.hours, c.minutes], [false, 0, 5, 30]);
  assert.equal(formatCountdown(c), "5h 30m");
  assert.equal(formatCountdown(countdown(new Date(d), d - 50 * H)), "50h 0m");
  assert.equal(countdown(new Date(d), d + 1).overdue, true);
  assert.equal(countdown(new Date(d), d - 72 * H).progress, 0);
  assert.equal(countdown(null), null);
});

test("timeline: rendered from the backend's timeline, never inferred in the browser", () => {
  const timeline = [
    { key: "paid", label: "Payment received and verified", state: "done", detail: "Verified with the payment provider.", at: paidAt },
    { key: "submitted", label: "Order submitted for review", state: "done", detail: "In queue.", at: paidAt },
    { key: "review", label: "Team review in progress", state: "current", detail: "Our team is reviewing your order.", at: "2026-10-14T11:00:00.000Z" },
    { key: "email", label: "Customer updated by email", state: "upcoming", detail: "After the review is completed.", at: null },
  ];
  const steps = timelineSteps({ status: "PAID", reviewStatus: "IN_REVIEW", timeline });
  assert.deepEqual(steps.map((s) => s.state), ["done", "done", "current", "upcoming"]);
  assert.equal(steps[2].note, "Our team is reviewing your order.");
  assert.equal(steps[2].at, "2026-10-14T11:00:00.000Z");
  // the browser must not "upgrade" a state: accepted stays accepted, failed stays failed
  const accepted = timelineSteps({ timeline: [{ key: "email", label: "x", state: "accepted", detail: "d" }] });
  assert.equal(accepted[0].state, "accepted");
});

test("accepted customer email preserves the server label and acceptance timestamp", () => {
  const acceptedAt = "2026-10-15T06:27:00.000Z";
  const [email] = timelineSteps({
    timeline: [{
      key: "email",
      label: "Customer email accepted",
      state: "accepted",
      detail: "Accepted by the mail server. Inbox delivery is not confirmed.",
      at: acceptedAt,
    }],
  });

  assert.equal(email.label, "Customer email accepted");
  assert.equal(email.state, "accepted");
  assert.equal(email.at, acceptedAt);
  assert.match(email.note, /Inbox delivery is not confirmed/);

  const olderAcceptedEmail = timelineSteps({
    timeline: [{ key: "email", label: "Customer email accepted", state: "accepted", detail: "Accepted.", at: null }],
  })[0];
  assert.equal(olderAcceptedEmail.at, null);
});

test("customer timeline preserves email failure and delivery labels with safe missing timestamps", () => {
  const failed = timelineSteps({
    timeline: [{
      key: "email",
      label: "Email sending failed",
      state: "failed",
      detail: "We couldn't send the email. Please contact support if you need assistance.",
      at: "2026-10-15T06:57:00.000Z",
      timeLabel: "Failure recorded at",
    }],
  })[0];
  assert.equal(failed.label, "Email sending failed");
  assert.equal(failed.state, "failed");
  assert.equal(failed.at, "2026-10-15T06:57:00.000Z");
  assert.equal(failed.timeLabel, "Failure recorded at");
  assert.doesNotMatch(failed.note, /SMTP|password|stack trace/i);

  const delivered = timelineSteps({
    timeline: [{
      key: "email",
      label: "Customer email delivered",
      state: "done",
      detail: "Delivery confirmed.",
      at: null,
      timeLabel: "Delivered at",
    }],
  })[0];
  assert.equal(delivered.state, "done");
  assert.equal(delivered.at, null);
  assert.equal(delivered.timeLabel, "Delivered at");
});

test("timeline: with no backend timeline nothing is claimed", () => {
  for (const order of [{ status: "PAID", reviewStatus: "RESPONDED" }, { status: "PAID" }, null, undefined, { timeline: [] }]) {
    const steps = timelineSteps(order);
    assert.equal(steps.length, 4);
    assert.ok(steps.every((s) => s.state === "unknown"));
  }
});

test("polling: continues while progress is possible, stops when nothing more can change", () => {
  assert.equal(pollIntervalMs(null), null);
  assert.equal(pollIntervalMs({ status: "FAILED" }), null);
  assert.equal(pollIntervalMs({ status: "PAID", reviewStatus: "PENDING_REVIEW" }), POLL_INTERVAL_MS);
  assert.equal(pollIntervalMs({ status: "PAID", reviewStatus: "IN_REVIEW" }), POLL_INTERVAL_MS);
  assert.equal(pollIntervalMs({ status: "PAID", reviewStatus: "INFO_REQUESTED", emailDelivery: "DELIVERED" }), POLL_INTERVAL_MS); // admin can resume
  assert.equal(pollIntervalMs({ status: "PAID", reviewStatus: "APPROVED", emailDelivery: "ACCEPTED" }), POLL_INTERVAL_MS); // may still become DELIVERED/BOUNCED
  assert.equal(pollIntervalMs({ status: "PAID", reviewStatus: "APPROVED", emailDelivery: "FAILED" }), POLL_INTERVAL_MS); // admin may retry
  assert.equal(pollIntervalMs({ status: "PAID", reviewStatus: "REJECTED", emailDelivery: "DELIVERED" }), null);
});

test("maskEmail", () => {
  assert.equal(maskEmail("anil@example.com"), "a***@example.com");
  assert.equal(maskEmail("nope"), "");
});
