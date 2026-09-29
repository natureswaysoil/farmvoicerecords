import Stripe from "stripe";
import { createClient } from "@supabase/supabase-js";
import { AccessError } from "@/src/lib/access-server";
export function stripeClient() {
  if (!process.env.STRIPE_RESTRICTED_KEY)
    throw new AccessError(
      "Billing is being configured. Please contact support.",
      503,
    );
  return new Stripe(process.env.STRIPE_RESTRICTED_KEY, {
    timeout: 15000,
    maxNetworkRetries: 1,
  });
}
export function billingAdmin() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key)
    throw new AccessError(
      "Billing is being configured. Please contact support.",
      503,
    );
  return createClient(url, key, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}
export function siteUrl() {
  const url = process.env.NEXT_PUBLIC_SITE_URL;
  if (!url || !/^https:\/\//.test(url))
    throw new AccessError("Billing return URL is not configured.", 503);
  return new URL(url).origin;
}
export function checkOrigin(request: Request) {
  const canonical=new URL(siteUrl());
  const alternate=new URL(canonical);
  alternate.hostname=canonical.hostname.startsWith("www.")?canonical.hostname.slice(4):`www.${canonical.hostname}`;
  if (![canonical.origin,alternate.origin].includes(request.headers.get("origin")??""))
    throw new AccessError("Invalid request origin.", 403);
}
export function prices(interval: "monthly" | "annual", h2a: boolean) {
  const core =
    interval === "monthly"
      ? process.env.STRIPE_CORE_MONTHLY_PRICE_ID
      : process.env.STRIPE_CORE_ANNUAL_PRICE_ID;
  const addon =
    interval === "monthly"
      ? process.env.STRIPE_H2A_MONTHLY_PRICE_ID
      : process.env.STRIPE_H2A_ANNUAL_PRICE_ID;
  if (!core || (h2a && !addon))
    throw new AccessError(
      "This plan is being configured. Please contact support.",
      503,
    );
  return [core, ...(h2a ? [addon!] : [])];
}
