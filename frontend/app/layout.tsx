import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import { GradientBackground } from "@/components/gradient-background";
import "./globals.css";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "Triage de Tickets",
  description:
    "Clasificación automática de tickets de soporte con bucle de autocorrección y validación estricta.",
};

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    // suppressHydrationWarning: password managers (LastPass, 1Password, ...)
    // inject attributes such as `data-lt-installed` into <html> before React
    // hydrates. The server HTML will never match that, and it is not ours to
    // fix. The warning is scoped to this element only.
    <html
      lang="es"
      suppressHydrationWarning
      className={`${geistSans.variable} ${geistMono.variable}`}
    >
      <body className="min-h-screen antialiased">
        <GradientBackground />
        {children}
      </body>
    </html>
  );
}
