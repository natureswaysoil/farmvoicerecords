import type { Metadata } from "next";
export const metadata: Metadata = {
  title: "Pesticide record template",
  description:
    "Pesticide record template for FarmVoice Records. Organize and review your farm records.",
};
export default function Layout({ children }: { children: React.ReactNode }) {
  return children;
}
