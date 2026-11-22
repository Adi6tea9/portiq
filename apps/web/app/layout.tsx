import type { Metadata } from "next";
import { Inter, Playfair_Display } from "next/font/google";
import "./globals.css";
import "@/themes/portiq/theme.css";

const inter = Inter({
  subsets: ["latin"],
  variable: "--font-inter",
  display: "swap",
});

// Display serif for PortIQ theme headings only (sign-in screens).
const playfair = Playfair_Display({
  subsets: ["latin"],
  weight: ["700"],
  variable: "--font-display",
  display: "swap",
});

export const metadata: Metadata = {
  title: "PortIQ - Shipment Planning & Port Capacity Forecasting",
  description: "Predict. Plan. Ship.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    // shortcut: PortIQ theme is always on; remove data-theme to restore the default look until a Settings switch exists.
    <html
      lang="en"
      data-theme="portiq"
      className={`${inter.variable} ${playfair.variable}`}
    >
      <body className="antialiased">{children}</body>
    </html>
  );
}
