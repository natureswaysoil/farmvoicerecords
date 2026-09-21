import { createBrowserClient } from "@supabase/ssr";

const supabaseUrl =
  process.env.NEXT_PUBLIC_SUPABASE_URL ??
  "https://vvcpyagznemodmwparlx.supabase.co";

const supabasePublishableKey =
  process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY ??
  "sb_publishable_eQCZgdRRXzrSYLYkoS1vWw_lnNEB27m";

export function createClient() {
  return createBrowserClient(supabaseUrl, supabasePublishableKey);
}
