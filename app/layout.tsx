import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Bering EU — Portal",
  description: "Oportunidades, precios de proveedores y automatizaciones de Bering EU",
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
