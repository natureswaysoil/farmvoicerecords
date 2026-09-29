import { NextResponse } from "next/server";
import { listOwnerFarms } from "@/src/lib/farm-owner-server";
import { createClient } from "@/src/lib/supabase/server";

export const runtime = "nodejs";

export async function GET() {
  try {
    const supabase = await createClient();
    const { data, error } = await supabase.auth.getUser();
    if (error || !data.user) {
      return NextResponse.json({ error: "Sign in is required." }, { status: 401 });
    }

    const farms = await listOwnerFarms(supabase, data.user.id);
    if (!farms.length) {
      return NextResponse.json({ error: "Farm owner access is required." }, { status: 403 });
    }

    return NextResponse.json({ farms });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Unable to load farms." },
      { status: 400 }
    );
  }
}
