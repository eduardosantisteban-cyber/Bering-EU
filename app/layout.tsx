import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Dársena · Bering EU",
  description: "Dársena, el portal de Bering EU: lo que hay que hacer hoy, oportunidades, marketing, proveedores y automatizaciones",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="es" className="h-full antialiased">
      <body className="min-h-full flex flex-col bg-[#f5f4f2] text-[#282828]">
        {children}
      </body>
    </html>
  );
}
