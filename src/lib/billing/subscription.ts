import type Stripe from "stripe";
export function subscriptionAccess(
  subscription: Stripe.Subscription,
  core: string[],
  addon: string[],
) {
  const items = subscription.items.data;
  const coreItems = items.filter((i) => core.includes(i.price.id));
  const addonItems = items.filter((i) => addon.includes(i.price.id));
  const end = (rows: typeof items) =>
    rows.length
      ? new Date(
          Math.min(...rows.map((i) => i.current_period_end)) * 1000,
        ).toISOString()
      : null;
  return {
    status: subscription.status,
    core_enabled: coreItems.length > 0,
    h2a_enabled: addonItems.length > 0,
    paid_through: end(coreItems),
    h2a_paid_through: end(addonItems),
    stripe_subscription_id: subscription.id,
    updated_at: new Date().toISOString(),
  };
}
