import type { Metadata } from "next";

import Cursor from "@/components/Cursor";
import Providers from "@/components/Providers";

import "./globals.css";

export const metadata: Metadata = {
  title: "stacked. we trade, you chill.",
  description:
    "Drop in any amount. Our traders do the trading. You watch it all live, no jargon, no gatekeeping.",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <head>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
        <link
          href="https://fonts.googleapis.com/css2?family=Bricolage+Grotesque:opsz,wdth,wght@12..96,75..100,200..800&family=Instrument+Serif:ital@0;1&family=Space+Mono&display=swap"
          rel="stylesheet"
        />
      </head>
      <body>
        <div id="dot" />
        <Cursor />
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}
