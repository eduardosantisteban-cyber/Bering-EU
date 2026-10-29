"use client";

import { useCallback, useEffect, useState } from "react";
import { usePathname, useRouter } from "next/navigation";
import { Anchor, ClipboardCheck, FileSearch, HelpCircle, Megaphone, PhoneCall, Settings2, Smartphone, Tags, Truck, X, type LucideIcon } from "lucide-react";

// Recorrido guiado de Dársena: sale la primera vez que alguien entra (en ese navegador) y se vuelve a abrir con
// el botón "?" de la cabecera. Cada paso lleva a su sección, resalta su pestaña (o el menú en el móvil) y, si la
// página tiene un elemento marcado con data-tour="…", lo resalta y lo centra en pantalla.
// El paso en curso se guarda en sessionStorage para seguir el recorrido al cambiar de página.

const CLAVE_VISTO = "darsena_tutorial_v2";
const CLAVE_PASO = "darsena_tutorial_paso";
const EVENTO = "darsena:tutorial";
const CLASE_FOCO = "tour-foco";

interface Paso {
  icono: LucideIcon;
  titulo: string;
  texto: string;
  ruta?: string; // sección a la que lleva el paso
  foco?: string; // data-tour del elemento de la página a resaltar
}

const PASOS: Paso[] = [
  {
    icono: Anchor,
    titulo: "Bienvenido a Dársena",
    texto:
      "Es el portal de Bering EU: lo que hay que hacer hoy, las oportunidades, los proveedores, el marketing y las automatizaciones, en un solo sitio. Los datos salen solos de Gmail, Holded, la hoja Solicitudes y Google Ads. Te llevamos sección por sección: es un minuto.",
  },
  {
    icono: ClipboardCheck,
    titulo: "Empieza el día en «Hoy»",
    ruta: "/",
    foco: "hoy",
    texto:
      "Esta bandeja junta todo lo que necesita a una persona: clientes a los que llamar o que han respondido, datos que faltan, proveedores sin respuesta, llamadas sin registrar y presupuestos por hacer. Lo marcado «Hoy» es lo urgente. Elige tu nombre arriba a la derecha para ver solo lo tuyo.",
  },
  {
    icono: FileSearch,
    titulo: "Oportunidades y su ficha",
    ruta: "/oportunidades",
    texto:
      "Aquí buscas cualquier oportunidad por cliente, código o estado. Ábrela y pulsa «Ficha completa»: verás qué toca, su línea de tiempo (entrada, estados, proveedores, seguimientos) y las líneas del presupuesto con su margen.",
  },
  {
    icono: PhoneCall,
    titulo: "Llamadas y WhatsApp: + Nueva",
    ruta: "/nueva",
    texto:
      "Los emails entran solos al etiquetarlos con «Presupuesto» en Gmail. Si la solicitud llega por teléfono o WhatsApp, regístrala aquí: en un minuto tendrás la oportunidad en Holded con su Sheet. Las llamadas de números nuevos aparecen abajo para registrarlas o descartarlas.",
  },
  {
    icono: Truck,
    titulo: "Proveedores",
    ruta: "/proveedores/panel",
    texto:
      "Cuánto tarda en responder cada proveedor y si es más caro o más barato que el resto. Más abajo editas la prioridad de marcas por tipo de producto y los costes de instalación y transporte que usa la automatización: lo que guardes aquí se aplica al siguiente presupuesto.",
  },
  {
    icono: Tags,
    titulo: "Precios",
    ruta: "/proveedores",
    texto:
      "La base de presupuestos de proveedores: busca por tipo, marca, modelo o medidas, compara ofertas, consulta fichas técnicas y monta un presupuesto rápido con el cotizador. Sube aquí los PDF de proveedores que te lleguen por otra vía.",
  },
  {
    icono: Megaphone,
    titulo: "Marketing",
    ruta: "/marketing",
    texto:
      "Google Ads al día: inversión frente a presupuesto, clics, impresiones y conversiones en el tiempo, cada campaña y los términos que buscó la gente (en rojo, los que gastan sin convertir). Arriba, el coste de cada solicitud que entra por la web. En Análisis y Productividad tienes conversión, tiempos y motivos de pérdida.",
  },
  {
    icono: Settings2,
    titulo: "Automatizaciones",
    ruta: "/automatizaciones",
    texto:
      "Qué hace cada automatización y si funciona en la cuenta de cada persona. Cada minuto revisan los emails etiquetados, crean presupuestos al marcar las casillas del Sheet, piden y leen precios de proveedores y hacen el seguimiento a clientes. Nada se envía solo: siempre te dejan borradores.",
  },
  {
    icono: Smartphone,
    titulo: "¡Listo!",
    ruta: "/",
    texto:
      "Desde el móvil funciona igual: las secciones están en el menú ☰. Puedes repetir este recorrido cuando quieras con el botón «?» de la cabecera.",
  },
];

const leer = (store: "local" | "session", clave: string): string | null => {
  try {
    return (store === "local" ? localStorage : sessionStorage).getItem(clave);
  } catch {
    return null;
  }
};
const guardar = (store: "local" | "session", clave: string, valor: string | null) => {
  try {
    const s = store === "local" ? localStorage : sessionStorage;
    if (valor === null) s.removeItem(clave);
    else s.setItem(clave, valor);
  } catch {
    /* sin almacenamiento */
  }
};

/** Botón "?" para volver a hacer el recorrido. */
export function BotonTutorial() {
  return (
    <button
      type="button"
      onClick={() => window.dispatchEvent(new Event(EVENTO))}
      className="rounded p-2 text-white/70 hover:bg-white/10 hover:text-white"
      aria-label="Recorrido por Dársena"
      title="Recorrido por Dársena"
    >
      <HelpCircle size={17} />
    </button>
  );
}

/** Quita el resaltado de todos los elementos. */
function limpiarFoco() {
  document.querySelectorAll("." + CLASE_FOCO).forEach((el) => el.classList.remove(CLASE_FOCO));
}

/** Resalta la pestaña de la sección (o el botón del menú si las pestañas no se ven) y el elemento de la página. */
function resaltar(p: Paso) {
  limpiarFoco();
  if (p.ruta) {
    const pestanas = Array.from(document.querySelectorAll<HTMLElement>(`[data-tour-nav="${p.ruta}"]`)).filter((el) => el.offsetParent !== null);
    const destino = pestanas[0] || document.querySelector<HTMLElement>('[data-tour-nav="menu"]');
    destino?.classList.add(CLASE_FOCO);
  }
  if (p.foco) {
    const el = document.querySelector<HTMLElement>(`[data-tour="${p.foco}"]`);
    if (el) {
      el.classList.add(CLASE_FOCO);
      el.scrollIntoView({ behavior: "smooth", block: "center" });
    }
  }
}

/** Recorrido guiado. */
export function Tutorial() {
  const router = useRouter();
  const pathname = usePathname() || "/";
  const [paso, setPaso] = useState<number | null>(null);

  // Al cargar la página: seguir el recorrido en curso o empezarlo si es la primera visita
  useEffect(() => {
    const enCurso = leer("session", CLAVE_PASO);
    const n = enCurso === null ? NaN : Number(enCurso);
    // eslint-disable-next-line react-hooks/set-state-in-effect -- estado del recorrido guardado en el navegador
    if (!isNaN(n) && n >= 0 && n < PASOS.length) setPaso(n);
    else if (leer("local", CLAVE_VISTO) !== "1" && leer("session", "darsena_tutorial_saltado") !== "1") setPaso(0);
    const abrir = () => {
      guardar("session", CLAVE_PASO, "0");
      setPaso(0);
    };
    window.addEventListener(EVENTO, abrir);
    return () => window.removeEventListener(EVENTO, abrir);
  }, []);

  const terminar = useCallback(() => {
    limpiarFoco();
    guardar("session", CLAVE_PASO, null);
    guardar("local", CLAVE_VISTO, "1");
    guardar("session", "darsena_tutorial_saltado", "1");
    setPaso(null);
  }, []);

  const ir = useCallback(
    (n: number) => {
      if (n < 0 || n >= PASOS.length) return;
      guardar("session", CLAVE_PASO, String(n));
      setPaso(n);
      const ruta = PASOS[n].ruta;
      if (ruta && ruta !== pathname) router.push(ruta);
    },
    [pathname, router]
  );

  // Resaltar al cambiar de paso (con un pequeño margen para que la página pinte su contenido)
  useEffect(() => {
    if (paso === null) return;
    const p = PASOS[paso];
    if (p.ruta && p.ruta !== pathname) return; // se resaltará al llegar a la página
    const t1 = setTimeout(() => resaltar(p), 150);
    const t2 = setTimeout(() => resaltar(p), 1200); // por si la sección aún estaba cargando datos
    return () => {
      clearTimeout(t1);
      clearTimeout(t2);
    };
  }, [paso, pathname]);

  useEffect(() => {
    if (paso === null) return;
    const tecla = (e: KeyboardEvent) => {
      if (e.key === "Escape") terminar();
      if (e.key === "ArrowRight") ir(paso + 1);
      if (e.key === "ArrowLeft") ir(paso - 1);
    };
    window.addEventListener("keydown", tecla);
    return () => window.removeEventListener("keydown", tecla);
  }, [paso, ir, terminar]);

  useEffect(() => () => limpiarFoco(), []);

  if (paso === null) return null;
  const p = PASOS[paso];
  const Icono = p.icono;
  const ultimo = paso === PASOS.length - 1;
  const portada = paso === 0;

  const tarjeta = (
    <div
      className={`pointer-events-auto w-full bg-white shadow-2xl ring-1 ring-black/5 ${
        portada ? "max-w-lg rounded-t-2xl sm:rounded-2xl" : "max-w-sm rounded-t-2xl sm:rounded-2xl"
      }`}
      role="dialog"
      aria-modal={portada}
      aria-labelledby="tutorial-titulo"
    >
      <div className="flex items-center justify-between px-5 pt-4">
        <span className="text-xs font-semibold uppercase tracking-wide text-[#8a8a8a]">
          Recorrido · {paso + 1} de {PASOS.length}
        </span>
        <button type="button" onClick={terminar} className="rounded p-1 text-[#8a8a8a] hover:bg-[#f5f4f2] hover:text-[#282828]" aria-label="Cerrar recorrido">
          <X size={18} />
        </button>
      </div>
      <div className="px-5 pb-1 pt-2">
        <div className="flex items-center gap-3">
          <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-[#fdecec] text-[#e83038]" aria-hidden>
            <Icono size={20} />
          </span>
          <h2 id="tutorial-titulo" className="text-lg font-bold leading-tight text-[#282828]">
            {p.titulo}
          </h2>
        </div>
        <p className="mt-3 text-sm leading-relaxed text-[#404040]">{p.texto}</p>
      </div>
      <div className="flex items-center gap-1.5 px-5 pt-3">
        {PASOS.map((x, i) => (
          <button
            key={i}
            type="button"
            onClick={() => ir(i)}
            aria-label={`Paso ${i + 1}: ${x.titulo}`}
            className={`h-1.5 rounded-full transition-all ${i === paso ? "w-5 bg-[#e83038]" : "w-1.5 bg-[#e2e0dc] hover:bg-[#8a8a8a]"}`}
          />
        ))}
      </div>
      <div className="flex items-center justify-between gap-2 px-5 pb-5 pt-4">
        <button type="button" onClick={terminar} className="text-sm font-medium text-[#606060] hover:text-[#282828]">
          {ultimo ? "" : "Saltar"}
        </button>
        <div className="flex gap-2">
          {paso > 0 && (
            <button type="button" onClick={() => ir(paso - 1)} className="rounded-md border border-[#e2e0dc] px-3.5 py-2 text-sm font-medium text-[#282828] hover:border-[#606060]">
              Atrás
            </button>
          )}
          <button
            type="button"
            onClick={() => (ultimo ? terminar() : ir(paso + 1))}
            className="rounded-md bg-[#282828] px-4 py-2 text-sm font-semibold text-white hover:bg-black"
          >
            {ultimo ? "Terminar" : portada ? "Empezar el recorrido →" : `Siguiente: ${PASOS[paso + 1].titulo.replace(/[«»¡!]/g, "")} →`}
          </button>
        </div>
      </div>
    </div>
  );

  // Portada centrada con fondo oscuro; el resto, panel abajo a la derecha para ver la sección detrás
  return portada ? (
    <div className="fixed inset-0 z-[60] flex items-end justify-center bg-black/50 sm:items-center sm:p-6" onClick={(e) => e.target === e.currentTarget && terminar()}>
      {tarjeta}
    </div>
  ) : (
    <div className="pointer-events-none fixed inset-x-0 bottom-0 z-[60] flex justify-center sm:inset-x-auto sm:bottom-5 sm:right-5 sm:justify-end">{tarjeta}</div>
  );
}
