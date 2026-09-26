import { NextResponse } from "next/server";
import { createClient } from "@/src/lib/supabase/server";
import { ensureOwnerFarm } from "@/src/lib/farm-owner-server";

export const runtime = "nodejs";

export async function POST() {
  try {
    const supabase = await createClient();
    const { data, error } = await supabase.auth.getUser();

    if (error || !data.user) {
      return NextResponse.json({ error: "Sign in is required." }, { status: 401 });
    }

    const result = await ensureOwnerFarm(supabase, data.user);
    return NextResponse.json({ ok: true, ...result });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Unable to initialize farm account." },
      { status: 400 }
    );
  }
}
