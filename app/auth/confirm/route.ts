import { type EmailOtpType } from "@supabase/supabase-js";
import { type NextRequest, NextResponse } from "next/server";
import { ensureOwnerFarm } from "@/src/lib/farm-owner-server";
import { createClient } from "@/src/lib/supabase/server";

function safeNext(value: string | null) {
  return value && value.startsWith("/") && !value.startsWith("//") ? value : "/records";
}

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const tokenHash = searchParams.get("token_hash");
  const type = searchParams.get("type") as EmailOtpType | null;
  const code = searchParams.get("code");
  const next = safeNext(searchParams.get("next"));
  const redirectTo = request.nextUrl.clone();
  redirectTo.pathname = next;
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
        if (!next.startsWith("/join")) {
          await ensureOwnerFarm(supabase, data.user);
        }
        return NextResponse.redirect(redirectTo);
      } catch {
        redirectTo.pathname = "/login";
        redirectTo.searchParams.set("error", "farm_setup_failed");
        redirectTo.searchParams.set("next", next);
        return NextResponse.redirect(redirectTo);
      }
    }
  }

  redirectTo.pathname = "/login";
  redirectTo.searchParams.set("error", "confirmation_invalid");
  redirectTo.searchParams.set("next", next);
  return NextResponse.redirect(redirectTo);
}
