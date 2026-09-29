import type { Metadata } from "next";
export const metadata: Metadata = {
  title: "Pricing and subscriptions",
  description:
    "Pricing and subscriptions for FarmVoice Records. Organize and review your farm records.",
};
export default function Layout({ children }: { children: React.ReactNode }) {
  return children;
}
