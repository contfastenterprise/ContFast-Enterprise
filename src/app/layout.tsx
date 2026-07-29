import type { Metadata } from "next";
import { Inter } from "next/font/google";
import "./globals.css";
import { cn } from "@/lib/utils";

const inter = Inter({
  subsets: ["latin"],
  variable: "--font-sans",
});

export const metadata: Metadata = {
  title: "ContFast Enterprise | Facturación Electrónica e-CF DGII",
  description: "Sistema de facturación electrónica e-CF multi-empresa homologado con la DGII de República Dominicana. Rápido, seguro e institucional.",
  manifest: "/manifest.json",
  icons: {
    icon: '/Icono.svg',
    apple: '/Icono.svg',
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="es"
      className={cn("h-full", "antialiased", inter.variable, "font-sans")}
      suppressHydrationWarning
    >
      <body className="min-h-full flex flex-col font-sans bg-background text-foreground">
        {children}
      </body>
    </html>
  );
}
