import { createBrowserClient } from "@supabase/ssr";
import { getSupabasePublicConfig } from "@/src/lib/supabase/config";

export function createClient() {
  const { url, publishableKey } = getSupabasePublicConfig();
  return createBrowserClient(url, publishableKey);
}
