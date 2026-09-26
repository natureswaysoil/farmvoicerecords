import { type EmailOtpType } from "@supabase/supabase-js";
import { type NextRequest, NextResponse } from "next/server";
import { ensureOwnerFarm } from "@/src/lib/farm-owner-server";
import { createClient } from "@/src/lib/supabase/server";

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const tokenHash = searchParams.get("token_hash");
  const type = searchParams.get("type") as EmailOtpType | null;
  const code = searchParams.get("code");
  const redirectTo = request.nextUrl.clone();
  redirectTo.pathname = "/records";
  redirectTo.search = "";

  const supabase = await createClient();
  let verified = false;

  if (tokenHash && type) {
    const { error } = await supabase.auth.verifyOtp({ type, token_hash: tokenHash });
    verified = !error;
  } else if (code) {
    const { error } = await supabase.auth.exchangeCodeForSession(code);
    verified = !error;
  }

  if (verified) {
    const { data } = await supabase.auth.getUser();
    if (data.user) {
      try {
        await ensureOwnerFarm(supabase, data.user);
        return NextResponse.redirect(redirectTo);
      } catch {
        redirectTo.pathname = "/login";
        redirectTo.searchParams.set("error", "farm_setup_failed");
        return NextResponse.redirect(redirectTo);
      }
    }
  }

  redirectTo.pathname = "/login";
  redirectTo.searchParams.set("error", "confirmation_invalid");
  return NextResponse.redirect(redirectTo);
}
