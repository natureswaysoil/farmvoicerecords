import assert from "node:assert/strict";
import test from "node:test";
import Stripe from "stripe";
import { subscriptionAccess } from "../src/lib/billing/subscription.ts";
test("subscription entitlements come from configured prices, never metadata", () => {
  const subscription = {
    id: "sub_example",
    status: "active",
    metadata: { h2a: "true" },
    items: {
      data: [
        { price: { id: "price_core" }, current_period_end: 2000000000 },
        { price: { id: "price_unknown" }, current_period_end: 2100000000 },
      ],
    },
  } as unknown as Stripe.Subscription;
  const result = subscriptionAccess(
    subscription,
    ["price_core"],
    ["price_h2a"],
  );
  assert.equal(result.core_enabled, true);
  assert.equal(result.h2a_enabled, false);
  assert.equal(result.h2a_paid_through, null);
  assert.equal(
    subscriptionAccess(
      { ...subscription, status: "canceled" },
      ["price_core"],
      [],
    ).status,
    "canceled",
  );
  assert.equal(
    subscriptionAccess(subscription, ["unrelated"], []).core_enabled,
    false,
  );
});
test("Stripe webhook signatures reject altered payloads", () => {
  const stripe = new Stripe("fixture-only");
  const secret = "fixture-webhook-secret";
  const payload = JSON.stringify({
    id: "evt_fixture",
    type: "customer.subscription.updated",
    data: { object: { id: "sub_fixture" } },
  });
  const signature = stripe.webhooks.generateTestHeaderString({
    payload,
    secret,
  });
  assert.equal(
    stripe.webhooks.constructEvent(payload, signature, secret).id,
    "evt_fixture",
  );
  assert.throws(() =>
    stripe.webhooks.constructEvent(payload + " ", signature, secret),
  );
  assert.throws(() =>
    stripe.webhooks.constructEvent(payload, "invalid", secret),
  );
});
