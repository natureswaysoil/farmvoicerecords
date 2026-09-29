import type { Metadata } from "next";
export const metadata: Metadata = {
  title: "H-2A payroll recordkeeping",
  description:
    "H-2A payroll recordkeeping for FarmVoice Records. Organize and review your farm records.",
};
export default function Layout({ children }: { children: React.ReactNode }) {
  return children;
}
