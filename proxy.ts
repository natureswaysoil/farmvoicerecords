import { type NextRequest } from "next/server";
import { updateSession } from "@/src/lib/supabase/proxy";

export async function proxy(request: NextRequest) {
  return updateSession(request);
}

export const config = {
  matcher: [
    "/((?!_next/static|_next/image|videos/|samples/|sw\\.js$|robots\\.txt$|sitemap\\.xml$|llms\\.txt$|api/billing/webhook$|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)",
  ],
};
