import type { Metadata } from "next";
import "../styles.css";

export const metadata: Metadata = {
  title: "MarketPulse Studio",
  description: "MarketPulse financial publishing workspace.",
  authors: [{ name: "MarketPulse" }],
  openGraph: {
    title: "MarketPulse Studio",
    description: "MarketPulse financial publishing workspace.",
    type: "website",
  },
  twitter: { card: "summary_large_image" },
  icons: { icon: "/icon.svg" },
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
