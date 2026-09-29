import { authorizeFarm, AccessError, apiError } from "@/src/lib/access-server";
import {
  stripeClient,
  billingAdmin,
  siteUrl,
  checkOrigin,
} from "@/src/lib/billing/server";
export async function POST(request: Request) {
  try {
    checkOrigin(request);
    const { farmId } = await request.json();
    await authorizeFarm(farmId, true);
    const { data } = await billingAdmin()
      .from("farm_billing")
      .select("stripe_customer_id")
      .eq("farm_id", farmId)
      .single();
    if (!data?.stripe_customer_id)
      throw new AccessError("Choose a subscription first.", 400);
    const session = await stripeClient().billingPortal.sessions.create({
      customer: data.stripe_customer_id,
      return_url: `${siteUrl()}/billing`,
    });
    return Response.json({ url: session.url });
  } catch (error) {
    return apiError(error);
  }
}
