"use client";

import { useEffect, useState } from "react";
import Image from "next/image";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { LogOut, Menu, X } from "lucide-react";
import { logout } from "@/lib/apiClient";
import { BotonTutorial, Tutorial } from "./Tutorial";

// Navegación común de Dársena (el portal de Bering EU).
// En pantallas pequeñas las secciones van en un menú desplegable.

export const NOMBRE_PORTAL = "Dársena";

export const SECCIONES = [
  { href: "/", label: "Inicio" },
  { href: "/oportunidades", label: "Oportunidades" },
  { href: "/nueva", label: "+ Nueva" },
  { href: "/analisis", label: "Análisis" },
  { href: "/marketing", label: "Marketing" },
  { href: "/productividad", label: "Productividad" },
  { href: "/proveedores/panel", label: "Proveedores" },
  { href: "/proveedores", label: "Precios" },
  { href: "/automatizaciones", label: "Automatizaciones" },
];

/** Sección activa: la de ruta más larga que coincide ("/proveedores/panel" gana a "/proveedores"). */
export function seccionActiva(pathname: string): string {
  let mejor = "/";
  for (const s of SECCIONES) {
    if (s.href === "/") continue;
    if ((pathname === s.href || pathname.startsWith(s.href + "/")) && s.href.length > mejor.length) mejor = s.href;
  }
  return pathname === "/" ? "/" : mejor;
}

/** Pestañas de sección (se usan también dentro de la cabecera de Precios de proveedores). */
export function PortalTabs({ vertical, onNavegar }: { vertical?: boolean; onNavegar?: () => void }) {
  const pathname = usePathname() || "/";
  const activa = seccionActiva(pathname);
  return (
    <nav aria-label="Secciones" className={vertical ? "flex flex-col gap-1" : "flex items-center gap-1 overflow-x-auto"}>
      {SECCIONES.map((s) => {
        const es = s.href === activa;
        return (
          <Link
            key={s.href}
            href={s.href}
            onClick={onNavegar}
            data-tour-nav={s.href}
            aria-current={es ? "page" : undefined}
            className={`whitespace-nowrap rounded-md px-3 font-medium transition ${vertical ? "py-2.5 text-base" : "py-1.5 text-sm"} ${
              es ? "bg-white text-[#282828]" : "text-white/75 hover:bg-white/10 hover:text-white"
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
  const [abierto, setAbierto] = useState(false);
  const pathname = usePathname();
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- cerrar el menú al cambiar de página
    setAbierto(false);
  }, [pathname]);
  async function handleLogout() {
    await logout();
    window.location.href = "/login";
  }
  return (
    <>
    <header className="sticky top-0 z-30 bg-black">
      <div className="flex flex-wrap items-center gap-x-4 gap-y-2 px-4 py-3 sm:px-5">
        <Link href="/" className="flex shrink-0 items-center gap-2.5" aria-label={`${NOMBRE_PORTAL} · Inicio`}>
          <Image src="/logo.jpg" alt="Bering EU" width={94} height={28} priority />
          <span className="border-l border-white/25 pl-2.5 text-[15px] font-semibold tracking-wide text-white">{NOMBRE_PORTAL}</span>
        </Link>
        <div className="hidden min-w-0 flex-1 lg:block">
          <PortalTabs />
        </div>
        <div className="ml-auto flex items-center gap-2">
          {children}
          <button
            onClick={() => setAbierto((v) => !v)}
            data-tour-nav="menu"
            className="rounded p-2 text-white/80 hover:bg-white/10 hover:text-white lg:hidden"
            aria-label={abierto ? "Cerrar menú" : "Abrir menú"}
            aria-expanded={abierto}
          >
            {abierto ? <X size={20} /> : <Menu size={20} />}
          </button>
          <BotonTutorial />
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
      {abierto && (
        <div className="border-t border-white/10 px-4 pb-4 pt-2 lg:hidden">
          <PortalTabs vertical onNavegar={() => setAbierto(false)} />
        </div>
      )}
    </header>
    <Tutorial />
    </>
  );
}
