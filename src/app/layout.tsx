import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Trade Gateway Simulator",
  description: "Private trading control plane - Paper mode",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body className="grid-bg scan">{children}</body>
    </html>
  );
}
