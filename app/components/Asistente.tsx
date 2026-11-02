"use client";

import { useEffect, useRef, useState } from "react";
import { usePathname } from "next/navigation";
import { Bot, Loader2, RotateCcw, Send, X } from "lucide-react";
import type { MensajeChat } from "@/lib/asistente";

// Asistente de Dársena: botón flotante abajo a la derecha en todas las secciones. Responde dudas y problemas de la
// automatización con los datos en directo (estado, errores y la oportunidad que se cite por su código).
// La conversación se guarda solo en esta pestaña del navegador.

const CLAVE = "darsena_asistente";
const SUGERENCIAS = [
  "¿Por qué un email no ha creado la oportunidad?",
  "¿Cómo pido precio a proveedores?",
  "¿Qué pasa con BEUQ…?",
  "¿Está funcionando la automatización?",
];

/** Negritas (**…**) y viñetas ("- ") muy sencillas. */
function Texto({ t }: { t: string }) {
  const lineas = t.split("\n");
  return (
    <div className="flex flex-col gap-1">
      {lineas.map((l, i) => {
        const vineta = /^\s*[-•*]\s+/.test(l);
        const limpio = l.replace(/^\s*[-•*]\s+/, "");
        const partes = limpio.split(/(\*\*[^*]+\*\*)/g).map((p, k) =>
          /^\*\*[^*]+\*\*$/.test(p) ? <b key={k}>{p.slice(2, -2)}</b> : <span key={k}>{p}</span>
        );
        if (!l.trim()) return null;
        return vineta ? (
          <p key={i} className="flex gap-1.5">
            <span aria-hidden>•</span>
            <span>{partes}</span>
          </p>
        ) : (
          <p key={i}>{partes}</p>
        );
      })}
    </div>
  );
}

export function Asistente() {
  const pathname = usePathname() || "/";
  const [abierto, setAbierto] = useState(false);
  const [mensajes, setMensajes] = useState<MensajeChat[]>([]);
  const [texto, setTexto] = useState("");
  const [pensando, setPensando] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const fin = useRef<HTMLDivElement | null>(null);
  const entrada = useRef<HTMLTextAreaElement | null>(null);

  useEffect(() => {
    try {
      const g = JSON.parse(sessionStorage.getItem(CLAVE) || "null");
      // eslint-disable-next-line react-hooks/set-state-in-effect -- conversación guardada en esta pestaña
      if (g && Array.isArray(g.mensajes)) setMensajes(g.mensajes);
      if (g && g.abierto) setAbierto(true);
    } catch {
      /* sin almacenamiento */
    }
  }, []);

  useEffect(() => {
    try {
      sessionStorage.setItem(CLAVE, JSON.stringify({ mensajes: mensajes.slice(-30), abierto }));
    } catch {
      /* sin almacenamiento */
    }
    fin.current?.scrollIntoView({ block: "end" });
  }, [mensajes, abierto]);

  useEffect(() => {
    if (abierto) entrada.current?.focus();
  }, [abierto]);

  async function enviar(pregunta: string) {
    const q = pregunta.trim();
    if (!q || pensando) return;
    const nuevos: MensajeChat[] = [...mensajes, { rol: "usuario", texto: q }];
    setMensajes(nuevos);
    setTexto("");
    setPensando(true);
    setError(null);
    try {
      const res = await fetch("/api/asistente", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ mensajes: nuevos, pagina: pathname }),
      });
      const body = await res.json().catch(() => null);
      if (!res.ok) throw new Error(body?.error || `Error ${res.status}`);
      setMensajes((m) => [...m, { rol: "asistente", texto: String(body.respuesta || "") }]);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setPensando(false);
    }
  }

  return (
    <>
      {!abierto && (
        <button
          type="button"
          onClick={() => setAbierto(true)}
          data-tour="asistente"
          className="fixed bottom-4 right-4 z-50 flex h-12 w-12 items-center justify-center rounded-full bg-[#282828] text-white shadow-lg ring-2 ring-white hover:bg-black sm:bottom-5 sm:right-5"
          aria-label="Abrir el asistente"
          title="Asistente: pregúntame cualquier duda de la automatización"
        >
          <Bot size={22} />
        </button>
      )}
      {abierto && (
        <div
          className="fixed inset-x-0 bottom-0 z-50 flex h-[75vh] flex-col overflow-hidden rounded-t-2xl bg-white shadow-2xl ring-1 ring-black/10 sm:inset-x-auto sm:bottom-5 sm:right-5 sm:h-[560px] sm:w-[380px] sm:rounded-2xl"
          role="dialog"
          aria-label="Asistente de Dársena"
        >
          <div className="flex items-center gap-2 border-b border-[#efefec] bg-[#282828] px-4 py-3 text-white">
            <Bot size={18} />
            <div className="min-w-0 flex-1">
              <p className="text-sm font-semibold leading-tight">Asistente</p>
              <p className="text-[11px] text-white/60">Dudas y problemas de la automatización</p>
            </div>
            {mensajes.length > 0 && (
              <button
                type="button"
                onClick={() => {
                  setMensajes([]);
                  setError(null);
                }}
                className="rounded p-1.5 text-white/70 hover:bg-white/10 hover:text-white"
                aria-label="Nueva conversación"
                title="Nueva conversación"
              >
                <RotateCcw size={15} />
              </button>
            )}
            <button type="button" onClick={() => setAbierto(false)} className="rounded p-1.5 text-white/70 hover:bg-white/10 hover:text-white" aria-label="Cerrar el asistente">
              <X size={17} />
            </button>
          </div>

          <div className="flex-1 overflow-y-auto px-4 py-3 text-sm">
            {!mensajes.length && (
              <div className="flex flex-col gap-2">
                <p className="text-[#606060]">Pregúntame por un error, cómo hacer algo o una oportunidad por su código (p. ej. BEUQ419).</p>
                {SUGERENCIAS.map((s) => (
                  <button
                    key={s}
                    type="button"
                    onClick={() => (s.includes("…") ? (setTexto(s.replace("…?", "")), entrada.current?.focus()) : enviar(s))}
                    className="rounded-lg border border-[#e2e0dc] px-3 py-2 text-left text-[13px] text-[#282828] hover:border-[#282828]"
                  >
                    {s}
                  </button>
                ))}
              </div>
            )}
            <div className="flex flex-col gap-2.5">
              {mensajes.map((m, i) =>
                m.rol === "usuario" ? (
                  <div key={i} className="ml-8 self-end whitespace-pre-wrap rounded-2xl rounded-br-sm bg-[#282828] px-3 py-2 text-white">
                    {m.texto}
                  </div>
                ) : (
                  <div key={i} className="mr-6 self-start rounded-2xl rounded-bl-sm bg-[#f5f4f2] px-3 py-2 text-[#282828]">
                    <Texto t={m.texto} />
                  </div>
                )
              )}
              {pensando && (
                <div className="mr-6 inline-flex items-center gap-2 self-start rounded-2xl bg-[#f5f4f2] px-3 py-2 text-[#606060]">
                  <Loader2 size={14} className="animate-spin" /> Mirando…
                </div>
              )}
              {error && <p className="text-xs text-[#b3161b]">{error}</p>}
              <div ref={fin} />
            </div>
          </div>

          <form
            onSubmit={(e) => {
              e.preventDefault();
              enviar(texto);
            }}
            className="flex items-end gap-2 border-t border-[#efefec] p-3"
          >
            <textarea
              ref={entrada}
              value={texto}
              onChange={(e) => setTexto(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && !e.shiftKey) {
                  e.preventDefault();
                  enviar(texto);
                }
                if (e.key === "Escape") setAbierto(false);
              }}
              rows={1}
              placeholder="Escribe tu duda…"
              className="max-h-28 min-h-[40px] flex-1 resize-none rounded-lg border border-[#e2e0dc] px-3 py-2 text-sm focus:border-[#282828] focus:outline-none"
              aria-label="Tu pregunta"
            />
            <button
              type="submit"
              disabled={!texto.trim() || pensando}
              className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-[#e83038] text-white hover:bg-[#c8232b] disabled:opacity-40"
              aria-label="Enviar"
            >
              <Send size={16} />
            </button>
          </form>
        </div>
      )}
    </>
  );
}
