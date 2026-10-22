"use client";

import Image from "next/image";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { LogOut } from "lucide-react";
import { logout } from "@/lib/apiClient";

// Navegación común del portal: Inicio · Oportunidades · + Nueva · Análisis · Productividad · Precios de proveedores · Automatizaciones.

export const SECCIONES = [
  { href: "/", label: "Inicio" },
  { href: "/oportunidades", label: "Oportunidades" },
  { href: "/nueva", label: "+ Nueva" },
  { href: "/analisis", label: "Análisis" },
  { href: "/productividad", label: "Productividad" },
  { href: "/proveedores", label: "Precios de proveedores" },
  { href: "/automatizaciones", label: "Automatizaciones" },
];

/** Pestañas de sección (se usan también dentro de la cabecera de Precios de proveedores). */
export function PortalTabs() {
  const pathname = usePathname() || "/";
  return (
    <nav aria-label="Secciones" className="flex items-center gap-1 overflow-x-auto">
      {SECCIONES.map((s) => {
        const activa = s.href === "/" ? pathname === "/" : pathname.startsWith(s.href);
        return (
          <Link
            key={s.href}
            href={s.href}
            aria-current={activa ? "page" : undefined}
            className={`whitespace-nowrap rounded-md px-3 py-1.5 text-sm font-medium transition ${
              activa ? "bg-white text-[#282828]" : "text-white/75 hover:bg-white/10 hover:text-white"
            }`}
          >
            {s.label}
          </Link>
        );
      })}
    </nav>
  );
}

export function PortalHeader({ children }: { children?: React.ReactNode }) {
  async function handleLogout() {
    await logout();
    window.location.href = "/login";
  }
  return (
    <header className="sticky top-0 z-30 bg-black">
      <div className="flex flex-wrap items-center gap-x-4 gap-y-2 px-5 py-3">
        <Link href="/" className="shrink-0" aria-label="Inicio">
          <Image src="/logo.jpg" alt="Bering EU" width={94} height={28} priority />
        </Link>
        <PortalTabs />
        <div className="ml-auto flex items-center gap-2">
          {children}
          <button
            onClick={handleLogout}
            className="rounded p-2 text-white/70 hover:bg-white/10 hover:text-white"
            aria-label="Salir"
            title="Salir"
          >
            <LogOut size={16} />
          </button>
        </div>
      </div>
    </header>
  );
}
