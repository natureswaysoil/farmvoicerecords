import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Equipment Data",
  description:
    "Connect or import farm equipment records into FarmVoice Records.",
  robots: { index: false, follow: false },
};

export default function Layout({ children }: { children: React.ReactNode }) {
  return children;
}
