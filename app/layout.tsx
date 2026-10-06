import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Sohan Soft Tech | School & College Fees",
  description:
    "Secure school and PU college fee management, payments, student ledgers, reports and institution administration.",
  other: {
    "codex-preview": "development",
  },
  icons: {
    icon: "/favicon.svg",
    shortcut: "/favicon.svg",
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body className="antialiased">{children}</body>
    </html>
  );
}
