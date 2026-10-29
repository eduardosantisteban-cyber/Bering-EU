"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { ClipboardCheck, FileSearch, HelpCircle, Megaphone, PhoneCall, Settings2, Truck, Anchor, X, type LucideIcon } from "lucide-react";

// Tutorial de bienvenida de Dársena: sale la primera vez que alguien entra (en ese navegador)
// y se puede volver a abrir con el botón "?" de la cabecera.

const CLAVE = "darsena_tutorial_v1";
const EVENTO = "darsena:tutorial";

interface Paso {
  icono: LucideIcon;
  titulo: string;
  texto: string;
  enlace?: { href: string; texto: string };
}

const PASOS: Paso[] = [
  {
    icono: Anchor,
    titulo: "Bienvenido a Dársena",
    texto:
      "Es el portal de Bering EU: aquí ves lo que hay que hacer hoy, todas las oportunidades, los proveedores, el marketing y las automatizaciones. Los datos salen solos de Gmail, Holded, la hoja Solicitudes y Google Ads. En un minuto te enseñamos lo básico.",
  },
  {
    icono: ClipboardCheck,
    titulo: "Empieza el día en «Hoy»",
    texto:
      "En el Inicio, la bandeja Hoy junta todo lo que necesita a una persona: clientes a los que llamar o que han respondido, datos que faltan, peticiones a proveedores sin enviar o sin respuesta, llamadas sin registrar y presupuestos por hacer. Lo marcado «Hoy» es lo urgente. Elige tu nombre arriba para ver solo lo tuyo.",
    enlace: { href: "/", texto: "Ir al Inicio" },
  },
  {
    icono: FileSearch,
    titulo: "Cada oportunidad tiene su ficha",
    texto:
      "En Oportunidades buscas por cliente, código o estado. Al abrir una, pulsa «Ficha completa»: verás qué toca, su línea de tiempo (entrada, estados, proveedores, seguimientos) y las líneas del presupuesto con su margen, con enlaces al Sheet, al PDF y a Gmail.",
    enlace: { href: "/oportunidades", texto: "Ver oportunidades" },
  },
  {
    icono: PhoneCall,
    titulo: "Llamadas y WhatsApp: + Nueva",
    texto:
      "Los emails se registran solos al etiquetarlos con «Presupuesto» en Gmail. Si la solicitud llega por teléfono o WhatsApp, regístrala en «+ Nueva»: en un minuto tendrás la oportunidad en Holded con su Sheet. Las llamadas de números nuevos aparecen ahí para registrarlas o descartarlas.",
    enlace: { href: "/nueva", texto: "Abrir + Nueva" },
  },
  {
    icono: Truck,
    titulo: "Proveedores y precios",
    texto:
      "En Proveedores ves cuánto tarda en responder cada uno y si es más caro o más barato que el resto, y editas la prioridad de marcas y los costes de instalación y transporte que usa la automatización. En Precios está la base de presupuestos de proveedores, el comparador y el cotizador.",
    enlace: { href: "/proveedores/panel", texto: "Ver proveedores" },
  },
  {
    icono: Megaphone,
    titulo: "Marketing y análisis",
    texto:
      "Marketing muestra Google Ads: inversión frente a presupuesto, clics, impresiones, conversiones, campañas y términos de búsqueda, y cuánto cuesta cada solicitud que llega por la web. Análisis y Productividad enseñan la conversión, los tiempos de respuesta y los motivos de pérdida.",
    enlace: { href: "/marketing", texto: "Ver marketing" },
  },
  {
    icono: Settings2,
    titulo: "Las automatizaciones trabajan por ti",
    texto:
      "Cada minuto revisan los emails etiquetados, crean presupuestos al marcar las casillas del Sheet, piden y leen precios de proveedores, recuerdan a los que no contestan y hacen el seguimiento a clientes. Nada se envía solo: siempre te dejan borradores. En Automatizaciones ves si todo funciona en tu cuenta.",
    enlace: { href: "/automatizaciones", texto: "Ver automatizaciones" },
  },
  {
    icono: Anchor,
    titulo: "Listo",
    texto:
      "Desde el móvil también funciona: las secciones están en el menú ☰. Puedes volver a ver este tutorial cuando quieras con el botón «?» de la cabecera.",
  },
];

/** Botón "?" para volver a abrir el tutorial. */
export function BotonTutorial() {
  return (
    <button
      type="button"
      onClick={() => window.dispatchEvent(new Event(EVENTO))}
      className="rounded p-2 text-white/70 hover:bg-white/10 hover:text-white"
      aria-label="Tutorial de Dársena"
      title="Tutorial de Dársena"
    >
      <HelpCircle size={17} />
    </button>
  );
}

/** Ventana del tutorial: se abre sola la primera vez y con el botón "?". */
export function Tutorial() {
  const [abierto, setAbierto] = useState(false);
  const [paso, setPaso] = useState(0);

  useEffect(() => {
    let visto = true;
    try {
      visto = localStorage.getItem(CLAVE) === "1";
    } catch {
      visto = true; // sin almacenamiento (ventana privada…): no se insiste
    }
    // eslint-disable-next-line react-hooks/set-state-in-effect -- primera visita en este navegador
    if (!visto) setAbierto(true);
    const abrir = () => {
      setPaso(0);
      setAbierto(true);
    };
    window.addEventListener(EVENTO, abrir);
    return () => window.removeEventListener(EVENTO, abrir);
  }, []);

  useEffect(() => {
    if (!abierto) return;
    const tecla = (e: KeyboardEvent) => {
      if (e.key === "Escape") cerrar();
      if (e.key === "ArrowRight") setPaso((p) => Math.min(PASOS.length - 1, p + 1));
      if (e.key === "ArrowLeft") setPaso((p) => Math.max(0, p - 1));
    };
    window.addEventListener("keydown", tecla);
    return () => window.removeEventListener("keydown", tecla);
  }, [abierto]);

  function cerrar() {
    setAbierto(false);
    try {
      localStorage.setItem(CLAVE, "1");
    } catch {
      /* sin almacenamiento */
    }
  }

  if (!abierto) return null;
  const p = PASOS[paso];
  const Icono = p.icono;
  const ultimo = paso === PASOS.length - 1;

  return (
    <div
      className="fixed inset-0 z-[60] flex items-end justify-center bg-black/50 p-0 sm:items-center sm:p-6"
      role="dialog"
      aria-modal="true"
      aria-labelledby="tutorial-titulo"
      onClick={(e) => e.target === e.currentTarget && cerrar()}
    >
      <div className="w-full max-w-lg rounded-t-2xl bg-white shadow-2xl sm:rounded-2xl">
        <div className="flex items-center justify-between px-5 pt-4">
          <span className="text-xs font-semibold uppercase tracking-wide text-[#8a8a8a]">
            Dársena · {paso + 1} de {PASOS.length}
          </span>
          <button type="button" onClick={cerrar} className="rounded p-1 text-[#8a8a8a] hover:bg-[#f5f4f2] hover:text-[#282828]" aria-label="Cerrar tutorial">
            <X size={18} />
          </button>
        </div>
        <div className="px-5 pb-2 pt-3">
          <span className="mb-3 flex h-11 w-11 items-center justify-center rounded-full bg-[#fdecec] text-[#e83038]" aria-hidden>
            <Icono size={22} />
          </span>
          <h2 id="tutorial-titulo" className="text-lg font-bold text-[#282828]">
            {p.titulo}
          </h2>
          <p className="mt-2 text-sm leading-relaxed text-[#404040]">{p.texto}</p>
          {p.enlace && (
            <Link href={p.enlace.href} onClick={cerrar} className="mt-3 inline-block text-sm font-semibold text-[#e83038] hover:underline">
              {p.enlace.texto} →
            </Link>
          )}
        </div>
        <div className="flex items-center gap-1.5 px-5 pt-3" aria-hidden>
          {PASOS.map((_, i) => (
            <span key={i} className={`h-1.5 rounded-full transition-all ${i === paso ? "w-5 bg-[#e83038]" : "w-1.5 bg-[#e2e0dc]"}`} />
          ))}
        </div>
        <div className="flex items-center justify-between gap-2 px-5 pb-5 pt-4">
          <button type="button" onClick={cerrar} className="text-sm font-medium text-[#606060] hover:text-[#282828]">
            {ultimo ? "" : "Saltar"}
          </button>
          <div className="flex gap-2">
            {paso > 0 && (
              <button
                type="button"
                onClick={() => setPaso(paso - 1)}
                className="rounded-md border border-[#e2e0dc] px-3.5 py-2 text-sm font-medium text-[#282828] hover:border-[#606060]"
              >
                Atrás
              </button>
            )}
            <button
              type="button"
              onClick={() => (ultimo ? cerrar() : setPaso(paso + 1))}
              className="rounded-md bg-[#282828] px-4 py-2 text-sm font-semibold text-white hover:bg-black"
            >
              {ultimo ? "Empezar" : paso === 0 ? "Empezar el recorrido" : "Siguiente"}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
