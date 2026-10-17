import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Coconut — Crack open risk",
  description: "An evidence-first financial crime investigation prototype.",
};

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en" data-scroll-behavior="smooth">
      <body>{children}</body>
    </html>
  );
}
