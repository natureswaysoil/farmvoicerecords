import { NextResponse } from "next/server";
import { createClient } from "@/src/lib/supabase/server";

export async function POST(request: Request) {
  const supabase = await createClient();
  const { data: userData } = await supabase.auth.getUser();
  if (!userData.user) {
    return NextResponse.redirect(new URL("/login?next=/fields/import", request.url), 303);
  }

  const form = await request.formData();
  const file = form.get("usdaFile");
  if (!(file instanceof File)) {
    return NextResponse.redirect(new URL("/fields/import?shared=no-file", request.url), 303);
  }

  const { data: membership } = await supabase
    .from("farm_members")
    .select("farm_id,role")
    .eq("user_id", userData.user.id)
    .eq("role", "owner")
    .order("created_at")
    .limit(1)
    .maybeSingle();

  if (!membership) {
    return NextResponse.redirect(new URL("/fields/import?shared=owner-required", request.url), 303);
  }

  const body = new FormData();
  body.append("farm_id", membership.farm_id);
  body.append("file", file, file.name);
  const { data, error } = await supabase.functions.invoke("import-usda-fields", { body });
  const url = new URL("/fields/import", request.url);
  if (error || (data && typeof data === "object" && "error" in data)) {
    url.searchParams.set("shared", "error");
  } else {
    url.searchParams.set("shared", "success");
    if (data?.inserted != null) url.searchParams.set("inserted", String(data.inserted));
    if (data?.updated != null) url.searchParams.set("updated", String(data.updated));
  }
  return NextResponse.redirect(url, 303);
}
