import type { Metadata } from "next";
export const metadata: Metadata = {
  title: "Quickbooks",
  description:
    "Quickbooks for FarmVoice Records. Organize and review your farm records.",
  robots: { index: false, follow: false },
};
export default function Layout({ children }: { children: React.ReactNode }) {
  return children;
}
