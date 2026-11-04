import type { Metadata } from "next";
import { GeistSans } from "geist/font/sans";
import { GeistMono } from "geist/font/mono";
import { Toaster } from "sonner";
import { THEME_INIT_SCRIPT } from "@/components/theme";
import "./globals.css";

export const metadata: Metadata = {
  title: { default: "Akquise-CRM", template: "%s · Akquise-CRM" },
  description: "B2B-Akquise und CRM für Gebäudereinigung in Hamburg",
  robots: { index: false, follow: false },
};

// Lokal gebündelte Schriften (kein Abruf externer Font-Server, DSGVO-freundlich)
export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="de" suppressHydrationWarning>
      <head>
        {/* Setzt hell/dunkel vor dem ersten Rendern (kein Aufblitzen) */}
        <script dangerouslySetInnerHTML={{ __html: THEME_INIT_SCRIPT }} />
      </head>
      <body className={`${GeistSans.variable} ${GeistMono.variable} font-sans`}>
        {children}
        <Toaster richColors position="bottom-right" theme="system" />
      </body>
    </html>
  );
}
