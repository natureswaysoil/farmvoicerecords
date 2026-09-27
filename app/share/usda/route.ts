import { NextResponse } from "next/server";
import { createClient } from "@/src/lib/supabase/server";

export async function POST(request: Request) {
  const supabase = await createClient();
  const { data: userData } = await supabase.auth.getUser();

  if (!userData.user) {
    const next = encodeURIComponent("/fields/import?shared=signin-required");
    return NextResponse.redirect(new URL(`/login?next=${next}`, request.url), 303);
  }

  const form = await request.formData();
  const file = form.get("usdaFile");
  if (!(file instanceof File)) {
    return NextResponse.redirect(new URL("/fields/import?shared=no-file", request.url), 303);
  }

  const { data: ownedFarm, error: ownerError } = await supabase
    .from("farms")
    .select("id")
    .eq("owner_user_id", userData.user.id)
    .maybeSingle();

  if (ownerError || !ownedFarm) {
    return NextResponse.redirect(new URL("/fields/import?shared=owner-required", request.url), 303);
  }

  const body = new FormData();
  body.append("farm_id", ownedFarm.id);
  body.append("file", file, file.name);
  const { data, error } = await supabase.functions.invoke("import-usda-fields", { body });

  const url = new URL("/fields/import", request.url);
  if (error || (data && typeof data === "object" && "error" in data)) {
    url.searchParams.set("shared", "error");
    const detail =
      error?.message ||
      (data && typeof data === "object" && "error" in data ? String(data.error) : "Import failed.");
    url.searchParams.set("detail", detail.slice(0, 300));
  } else {
    url.searchParams.set("shared", "success");
    if (data?.inserted != null) url.searchParams.set("inserted", String(data.inserted));
    if (data?.updated != null) url.searchParams.set("updated", String(data.updated));
    if (data?.skipped != null) url.searchParams.set("skipped", String(data.skipped));
  }
  return NextResponse.redirect(url, 303);
}
