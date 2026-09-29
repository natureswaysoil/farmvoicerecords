import Stripe from "stripe";
import { stripeClient, billingAdmin } from "@/src/lib/billing/server";
import { subscriptionAccess } from "@/src/lib/billing/subscription";
export const maxDuration = 60;
export const runtime = "nodejs";
export async function POST(request: Request) {
  const signature = request.headers.get("stripe-signature");
  const secret = process.env.STRIPE_WEBHOOK_SECRET;
  if (!secret)
    return Response.json(
      { error: "Webhook is not configured." },
      { status: 503 },
    );
  let event: Stripe.Event;
  let stripe: Stripe;
  try {
    stripe = stripeClient();
  } catch {
    return Response.json(
      { error: "Webhook configuration unavailable." },
      { status: 503 },
    );
  }
  let lock: { farmId: string; until: string } | null = null;
  try {
    event = stripe.webhooks.constructEvent(
      await request.text(),
      signature ?? "",
      secret,
    );
  } catch {
    return Response.json({ error: "Invalid signature." }, { status: 400 });
  }
  try {
    let subscriptionId: string | null = null;
    if (event.type.startsWith("customer.subscription."))
      subscriptionId = (event.data.object as Stripe.Subscription).id;
    if (["invoice.paid", "invoice.payment_failed"].includes(event.type)) {
      const invoice = event.data.object as Stripe.Invoice;
      const sub = invoice.parent?.subscription_details?.subscription;
      subscriptionId = typeof sub === "string" ? sub : (sub?.id ?? null);
    }
    if (!subscriptionId) return Response.json({ received: true });
    // Read current Stripe state; delayed events cannot restore a canceled subscription.
    let subscription = await stripe.subscriptions.retrieve(subscriptionId);
    const customerId =
      typeof subscription.customer === "string"
        ? subscription.customer
        : subscription.customer.id;
    const db = billingAdmin();
    const { data, error } = await db
      .from("farm_billing")
      .select("farm_id,stripe_subscription_id")
      .eq("stripe_customer_id", customerId)
      .maybeSingle();
    if (error) throw error;
    if (!data) return Response.json({ received: true });
    const until = new Date(Date.now() + 120000).toISOString();
    const lease = await db
      .from("farm_billing")
      .update({ webhook_lock_until: until })
      .eq("farm_id", data.farm_id)
      .lt("webhook_lock_until", new Date().toISOString())
      .select("farm_id");
    if (lease.error || !lease.data?.length)
      throw new Error("Subscription update in progress");
    lock = { farmId: data.farm_id, until };
    // Retrieve after obtaining the lease, so parallel events cannot reorder writes.
    subscription = await stripe.subscriptions.retrieve(subscriptionId);
    const latest = await db
      .from("farm_billing")
      .select("stripe_subscription_id")
      .eq("farm_id", data.farm_id)
      .single();
    if (latest.error) throw latest.error;
    data.stripe_subscription_id = latest.data.stripe_subscription_id;
    // Old canceled subscriptions must not overwrite a replacement subscription.
    if (
      data.stripe_subscription_id &&
      data.stripe_subscription_id !== subscription.id
    ) {
      const current = await stripe.subscriptions.retrieve(
        data.stripe_subscription_id,
      );
      if (!["canceled", "incomplete_expired"].includes(current.status))
        return Response.json({ received: true });
    }
    const update = await db
      .from("farm_billing")
      .update(
        subscriptionAccess(
          subscription,
          [
            process.env.STRIPE_CORE_MONTHLY_PRICE_ID,
            process.env.STRIPE_CORE_ANNUAL_PRICE_ID,
          ].filter((v): v is string => Boolean(v)),
          [
            process.env.STRIPE_H2A_MONTHLY_PRICE_ID,
            process.env.STRIPE_H2A_ANNUAL_PRICE_ID,
          ].filter((v): v is string => Boolean(v)),
        ),
      )
      .eq("farm_id", data.farm_id);
    if (update.error) throw update.error;
    return Response.json({ received: true });
  } catch {
    return Response.json(
      { error: "Webhook processing failed; retry required." },
      { status: 500 },
    );
  } finally {
    if (lock)
      await billingAdmin()
        .from("farm_billing")
        .update({ webhook_lock_until: new Date(0).toISOString() })
        .eq("farm_id", lock.farmId)
        .eq("webhook_lock_until", lock.until);
  }
}
