import { redirect } from "next/navigation";
import { createClient } from "@/src/lib/supabase/server";
import OutreachDashboard from "./outreach-dashboard";

const ADMIN_EMAILS = new Set([
  "natureswaysoil@gmail.com",
  "james@farmvoicerecords.com",
]);

export const metadata = {
  title: "Facebook outreach",
  description: "Private FarmVoice Facebook group outreach dashboard.",
};

export default async function OutreachPage() {
  const supabase = await createClient();
  const { data, error } = await supabase.auth.getUser();
  const email = data.user?.email?.toLowerCase() ?? "";

  if (error || !data.user) {
    redirect("/login?next=%2Fadmin%2Foutreach");
  }

  if (!ADMIN_EMAILS.has(email)) {
    redirect("/");
  }

  return <OutreachDashboard />;
}
