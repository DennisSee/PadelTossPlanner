import type { Metadata } from "next";
import type { ReactNode } from "react";

import "./globals.css";

export const metadata: Metadata = {
  title: "T.C. Zuid TOS",
  description: "De nieuwe TOS-website van T.C. Zuid.",
  icons: {
    icon: [{ url: "/tc-zuid-favicon.png", sizes: "329x329", type: "image/png" }],
    apple: [{ url: "/tc-zuid-favicon.png", sizes: "329x329", type: "image/png" }],
  },
};

export default function RootLayout({ children }: Readonly<{ children: ReactNode }>) {
  return (
    <html lang="nl">
      <body>{children}</body>
    </html>
  );
}
