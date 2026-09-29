import type { Metadata } from "next";
export const metadata: Metadata = {
  title: "Offline",
  description:
    "Offline for FarmVoice Records. Organize and review your farm records.",
  robots: { index: false, follow: false },
};
export default function Layout({ children }: { children: React.ReactNode }) {
  return children;
}
