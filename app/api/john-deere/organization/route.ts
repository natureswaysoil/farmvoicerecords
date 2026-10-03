import { NextResponse } from "next/server";
import { getJohnDeereConnection } from "@/src/lib/john-deere-server";

export const runtime = "nodejs";

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const farmId = typeof body.farmId === "string" ? body.farmId : null;
    const orgId = typeof body.orgId === "string" ? body.orgId.trim() : "";
    if (!orgId) {
      return NextResponse.json({ error: "Organization is required." }, { status: 400 });
    }

    const ctx = await getJohnDeereConnection(farmId);
    if (!ctx.connection) throw new Error("John Deere is not connected.");

    const organizations = Array.isArray(ctx.connection.organizations)
      ? ctx.connection.organizations
      : [];
    const selected = organizations.find(
      (organization: { id?: string }) => organization.id === orgId,
    );
    if (!selected) {
      return NextResponse.json(
        { error: "That John Deere organization is not authorized for this farm." },
        { status: 400 },
      );
    }

    const { error } = await ctx.supabase
      .from("john_deere_connections")
      .update({
        selected_org_id: orgId,
        selected_org_name: selected.name ?? null,
        status: "connected",
        last_error: null,
        updated_at: new Date().toISOString(),
      })
      .eq("farm_id", ctx.farmId);
    if (error) throw error;

    return NextResponse.json({ ok: true });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Unable to select organization." },
      { status: 400 },
    );
  }
}
