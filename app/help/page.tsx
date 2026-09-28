import type { Metadata } from "next";
import HelpCenterClient from "@/src/components/help-center-client";

export const metadata: Metadata = {
  title: "Help & FAQ | FarmVoice Records",
  description: "FarmVoice getting started tour, searchable FAQ, and support.",
};

export default function HelpPage() {
  return <HelpCenterClient />;
}
