import type { Metadata, Viewport } from "next";
import { Inter } from "next/font/google";

import { CookieBanner } from "@/components/common/cookie-banner";

import "./globals.css";

const inter = Inter({
  subsets: ["latin"],
  variable: "--font-sans",
  display: "swap",
});

export const metadata: Metadata = {
  title: {
    default: "BeleggerIQ – Portfolio Intelligence",
    template: "%s · BeleggerIQ",
  },
  description:
    "Portfolio-analyse, factor scoring, risicoanalyse en maandelijkse koopbeslissingen voor Nederlandse langetermijnbeleggers.",
  applicationName: "BeleggerIQ",
};

export const viewport: Viewport = {
  themeColor: "#0b1220",
  width: "device-width",
  initialScale: 1,
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="nl" className={`dark ${inter.variable}`} suppressHydrationWarning>
      <body className="min-h-screen font-sans antialiased">
        {children}
        <CookieBanner />
      </body>
    </html>
  );
}
