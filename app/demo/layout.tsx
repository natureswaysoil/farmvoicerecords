import type { Metadata } from "next";
export const metadata: Metadata = {
  title: "Voice-to-record demo",
  description:
    "Voice-to-record demo for FarmVoice Records. Organize and review your farm records.",
};
export default function Layout({ children }: { children: React.ReactNode }) {
  return children;
}
