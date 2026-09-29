import { z } from "zod";
import { createHash } from "node:crypto";
import { authorizeFarm, AccessError, apiError } from "@/src/lib/access-server";
import {
  stripeClient,
  billingAdmin,
  siteUrl,
  prices,
  checkOrigin,
} from "@/src/lib/billing/server";
const schema = z.object({
  farmId: z.uuid(),
  interval: z.enum(["monthly", "annual"]),
  h2a: z.boolean(),
});
export async function POST(request: Request) {
  let lock: { farmId: string; until: string } | null = null;
  try {
    checkOrigin(request);
    const input = schema.safeParse(await request.json());
    if (!input.success) throw new AccessError("Choose a farm and plan.", 400);
    const { farmId, interval, h2a } = input.data;
    const { user } = await authorizeFarm(farmId, true);
    const stripe = stripeClient();
    const db = billingAdmin();
    const lineItems = prices(interval, h2a);
    const { data: billing, error } = await db
      .from("farm_billing")
      .select("*")
      .eq("farm_id", farmId)
      .single();
    if (error || !billing)
      throw new AccessError("Farm billing is unavailable.", 503);
    const until = new Date(Date.now() + 300000).toISOString();
    const lease = await db
      .from("farm_billing")
      .update({ checkout_lock_until: until })
      .eq("farm_id", farmId)
      .lt("checkout_lock_until", new Date().toISOString())
      .select("farm_id");
    if (lease.error || !lease.data?.length)
      throw new AccessError(
        "Checkout is already opening. Wait a moment and retry.",
        409,
      );
    lock = { farmId, until };
    let customerId: string = billing.stripe_customer_id;
    if (!customerId) {
      const customer = await stripe.customers.create(
        { email: user.email },
        { idempotencyKey: `farm-customer-${farmId}` },
      );
      customerId = customer.id;
      const saved = await db
        .from("farm_billing")
        .update({ stripe_customer_id: customerId })
        .eq("farm_id", farmId);
      if (saved.error)
        throw new AccessError("Could not initialize billing.", 503);
    }
    const subscriptions = await stripe.subscriptions.list({
      customer: customerId,
      status: "all",
      limit: 100,
    });
    if (
      subscriptions.data.some(
        (s) => !["canceled", "incomplete_expired"].includes(s.status),
      )
    )
      throw new AccessError(
        "This farm already has a subscription. Use Manage billing.",
        409,
      );
    // Reuse a pending checkout even if another browser tab requests a different plan.
    const sessions = await stripe.checkout.sessions.list({
      customer: customerId,
      status: "open",
      limit: 1,
    });
    if (sessions.data[0]?.url)
      return Response.json({ url: sessions.data[0].url });
    const trialEnd = Math.floor(
      new Date(billing.trial_ends_at).getTime() / 1000,
    );
    const suffix = Array.from(
      createHash("sha256").update(farmId).digest().subarray(0, 8),
      (n) => String.fromCharCode(97 + (n % 26)),
    ).join("");
    const session = await stripe.checkout.sessions.create(
      {
        mode: "subscription",
        customer: customerId,
        integration_identifier: `farmvoice-${suffix}`,
        line_items: lineItems.map((price) => ({ price, quantity: 1 })),
        subscription_data:
          trialEnd > Date.now() / 1000 + 172800 ? { trial_end: trialEnd } : {},
        success_url: `${siteUrl()}/billing?checkout=complete`,
        cancel_url: `${siteUrl()}/billing`,
        expires_at: (Math.floor(Date.now() / 3600000) + 2) * 3600,
      },
      {
        idempotencyKey: `checkout-${farmId}-${Math.floor(Date.now() / 3600000)}`,
      },
    );
    return Response.json({ url: session.url });
  } catch (error) {
    return apiError(error);
  } finally {
    if (lock)
      await billingAdmin()
        .from("farm_billing")
        .update({ checkout_lock_until: new Date(0).toISOString() })
        .eq("farm_id", lock.farmId)
        .eq("checkout_lock_until", lock.until);
  }
}
