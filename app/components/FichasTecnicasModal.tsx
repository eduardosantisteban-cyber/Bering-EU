"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Download, Loader2, Sparkles, Trash2, Upload, X } from "lucide-react";
import { CATEGORIAS } from "@/lib/constants";
import { normalizeMarca, normalizeStr } from "@/lib/format";
import { compararRecencia, fechaDeFicha, versionesAnteriores } from "@/lib/fichaMatch";
import {
  createFicha,
  deleteFicha,
  discardUploadedFicha,
  extractFichaMetadata,
  fetchFichas,
  getFichaDownloadUrl,
  requestFichaUploadUrl,
  updateFicha,
} from "@/lib/apiClient";
import { putFileToSignedUrl } from "@/lib/uploadDirect";
import type { FichaTecnica } from "@/lib/types";
import { Button, Field, ModalHeader, Overlay, inputStyleSm } from "./ui";

interface QueueEntry {
  localId: string;
  filename: string;
  status: "subiendo" | "analizando" | "error";
  error: string | null;
}

function localUid(): string {
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
}

export default function FichasTecnicasModal({
  onClose,
  onNotice,
}: {
  onClose: () => void;
  onNotice: (type: "error" | "success", message: string) => void;
}) {
  const [fichas, setFichas] = useState<FichaTecnica[]>([]);
  const [loading, setLoading] = useState(true);
  const [queue, setQueue] = useState<QueueEntry[]>([]);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [filterCategoria, setFilterCategoria] = useState("");
  const [filterMarca, setFilterMarca] = useState("");
  const [search, setSearch] = useState("");

  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [previewLoading, setPreviewLoading] = useState(false);
  const [refillingId, setRefillingId] = useState<string | null>(null);
  const [verAnteriores, setVerAnteriores] = useState(false);
  const [leyendoFechas, setLeyendoFechas] = useState<{ hechas: number; total: number } | null>(null);

  const refresh = useCallback(async () => {
    try {
      const data = await fetchFichas();
      setFichas(data);
    } catch (err) {
      onNotice("error", "No se pudieron cargar las fichas técnicas: " + (err as Error).message);
    } finally {
      setLoading(false);
    }
  }, [onNotice]);

  useEffect(() => {
    refresh();
  }, [refresh]);

  const marcasDisponibles = useMemo(() => {
    const map = new Map<string, string>();
    for (const f of fichas) {
      if (!f.marca) continue;
      const key = normalizeMarca(f.marca);
      if (!key || map.has(key)) continue;
      map.set(key, f.marca);
    }
    return Array.from(map.values()).sort();
  }, [fichas]);

  // Fichas con otra más reciente del mismo producto (se ocultan salvo que se pida verlas)
  const anteriores = useMemo(() => versionesAnteriores(fichas), [fichas]);
  const sinFecha = fichas.filter((f) => !f.fecha_documento);

  const filtered = useMemo(() => {
    let out = fichas;
    if (filterCategoria) out = out.filter((f) => normalizeStr(f.categoria) === normalizeStr(filterCategoria));
    if (filterMarca) out = out.filter((f) => normalizeMarca(f.marca) === normalizeMarca(filterMarca));
    if (search.trim()) {
      const q = search.trim().toLowerCase();
      out = out.filter((f) =>
        [f.tipo_producto, f.marca, f.modelo, f.nombre_archivo].filter(Boolean).some((v) => String(v).toLowerCase().includes(q))
      );
    }
    if (!verAnteriores) out = out.filter((f) => !anteriores.has(f.id));
    return [...out].sort((a, b) => {
      const ka = normalizeMarca(a.marca) + "|" + normalizeStr(a.modelo || a.nombre_archivo);
      const kb = normalizeMarca(b.marca) + "|" + normalizeStr(b.modelo || b.nombre_archivo);
      return ka === kb ? compararRecencia(a, b) : ka.localeCompare(kb);
    });
  }, [fichas, filterCategoria, filterMarca, search, verAnteriores, anteriores]);

  const selected = fichas.find((f) => f.id === selectedId) ?? null;

  useEffect(() => {
    if (!selected) {
      setPreviewUrl(null);
      return;
    }
    let cancelled = false;
    setPreviewLoading(true);
    setPreviewUrl(null);
    getFichaDownloadUrl(selected.id)
      .then((url) => {
        if (!cancelled) setPreviewUrl(url);
      })
      .catch((err) => {
        if (!cancelled) onNotice("error", "No se pudo cargar la vista previa: " + (err as Error).message);
      })
      .finally(() => {
        if (!cancelled) setPreviewLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [selected, onNotice]);

  async function uploadOne(file: File) {
    const localId = localUid();
    setQueue((q) => [...q, { localId, filename: file.name, status: "subiendo", error: null }]);
    try {
      const { id, path, signedUrl } = await requestFichaUploadUrl(file.name);
      await putFileToSignedUrl(signedUrl, file);

      setQueue((q) => q.map((e) => (e.localId === localId ? { ...e, status: "analizando" } : e)));
      // Mejor esfuerzo: si la IA no consigue clasificarla, se guarda igual
      // en blanco y se puede rellenar a mano o reintentar luego.
      const metadata = await extractFichaMetadata(path).catch(() => null);

      const ficha = await createFicha({
        id,
        categoria: metadata?.categoria || "",
        tipo_producto: metadata?.tipo_producto ?? null,
        marca: metadata?.marca ?? null,
        modelo: metadata?.modelo ?? null,
        fecha_documento: metadata?.fecha_documento ?? null,
        version: metadata?.version ?? null,
        nombre_archivo: file.name,
        storage_path: path,
      }).catch(async (err) => {
        await discardUploadedFicha(path);
        throw err;
      });
      setFichas((prev) => [ficha, ...prev]);
      setQueue((q) => q.filter((e) => e.localId !== localId));
    } catch (err) {
      setQueue((q) =>
        q.map((e) => (e.localId === localId ? { ...e, status: "error", error: (err as Error).message } : e))
      );
    }
  }

  function onFilesSelected(fileList: FileList | null) {
    if (!fileList) return;
    const files = Array.from(fileList).filter((f) => f.type === "application/pdf");
    for (const file of files) uploadOne(file);
  }

  function discardQueueEntry(localId: string) {
    setQueue((q) => q.filter((e) => e.localId !== localId));
  }

  async function patchFicha(id: string, patch: Partial<Pick<FichaTecnica, "categoria" | "tipo_producto" | "marca" | "modelo" | "fecha_documento" | "version">>) {
    const previous = fichas;
    setFichas((prev) => prev.map((f) => (f.id === id ? { ...f, ...patch } : f)));
    try {
      await updateFicha(id, patch);
    } catch (err) {
      setFichas(previous);
      onNotice("error", "No se pudo guardar el cambio: " + (err as Error).message);
    }
  }

  async function handleRefillWithAI(f: FichaTecnica) {
    setRefillingId(f.id);
    try {
      const metadata = await extractFichaMetadata(f.storage_path);
      await patchFicha(f.id, metadata);
      onNotice("success", "Ficha técnica clasificada con IA.");
    } catch (err) {
      onNotice("error", "No se pudo clasificar con IA: " + (err as Error).message);
    } finally {
      setRefillingId(null);
    }
  }

  /** Lee con IA la fecha y versión de las fichas que no la tienen (una a una, sin tocar lo demás). */
  async function leerFechas() {
    const pendientes = fichas.filter((f) => !f.fecha_documento);
    setLeyendoFechas({ hechas: 0, total: pendientes.length });
    let sinDato = 0;
    for (let i = 0; i < pendientes.length; i++) {
      const f = pendientes[i];
      try {
        const m = await extractFichaMetadata(f.storage_path);
        if (m.fecha_documento || m.version) await patchFicha(f.id, { fecha_documento: m.fecha_documento ?? null, version: m.version ?? f.version ?? null });
        else sinDato++;
      } catch {
        sinDato++;
      }
      setLeyendoFechas({ hechas: i + 1, total: pendientes.length });
    }
    setLeyendoFechas(null);
    await refresh();
    onNotice("success", `Fechas leídas.${sinDato ? ` ${sinDato} ficha(s) no indican fecha: se ordenan por el año del nombre del archivo o por cuándo se subieron.` : ""}`);
  }

  async function handleDownload(id: string) {
    try {
      const url = await getFichaDownloadUrl(id);
      window.open(url, "_blank", "noopener,noreferrer");
    } catch (err) {
      onNotice("error", "No se pudo abrir el archivo: " + (err as Error).message);
    }
  }

  async function handleDelete(f: FichaTecnica) {
    if (!window.confirm(`¿Borrar la ficha técnica "${f.nombre_archivo}"?`)) return;
    try {
      await deleteFicha(f.id);
      setFichas((prev) => prev.filter((x) => x.id !== f.id));
      if (selectedId === f.id) setSelectedId(null);
      onNotice("success", "Ficha técnica borrada.");
    } catch (err) {
      onNotice("error", "No se pudo borrar: " + (err as Error).message);
    }
  }

  return (
    <Overlay onClose={onClose}>
      <div className="flex h-[88vh] w-[min(1300px,97vw)] flex-col rounded-xl bg-white">
        <ModalHeader
          title="Fichas técnicas"
          subtitle="Especificaciones de producto para consultar y descargar"
          onClose={onClose}
        />
        <div className="flex flex-1 overflow-hidden">
          <div className="flex w-[340px] shrink-0 flex-col border-r border-[#e2e0dc]">
            <div className="p-3">
              <input
                ref={fileInputRef}
                type="file"
                accept="application/pdf"
                multiple
                className="hidden"
                onChange={(e) => {
                  onFilesSelected(e.target.files);
                  e.target.value = "";
                }}
              />
              <button
                onClick={() => fileInputRef.current?.click()}
                className="flex w-full flex-col items-center justify-center gap-1.5 rounded-lg border-2 border-dashed border-[#e2e0dc] py-4 text-[#606060] hover:border-[#e83038] hover:text-[#e83038]"
              >
                <Upload size={18} />
                <span className="text-xs">Subir fichas técnicas (PDF)</span>
              </button>

              {queue.length > 0 && (
                <div className="mt-2 flex flex-col gap-1.5">
                  {queue.map((e) => (
                    <div
                      key={e.localId}
                      className={`flex items-center justify-between rounded-md border px-2 py-1 text-xs ${
                        e.status === "error" ? "border-[#e83038]/40 text-[#e83038]" : "border-[#e2e0dc] text-[#606060]"
                      }`}
                    >
                      <span className="flex items-center gap-1.5 truncate">
                        {e.status !== "error" && <Loader2 size={12} className="animate-spin shrink-0" />}
                        <span className="truncate">
                          {e.filename}
                          {e.status === "analizando" && " — analizando con IA…"}
                          {e.status === "error" && ` — ${e.error}`}
                        </span>
                      </span>
                      {e.status === "error" && (
                        <button onClick={() => discardQueueEntry(e.localId)} className="shrink-0 rounded p-0.5 hover:bg-[#e83038]/5">
                          <X size={12} />
                        </button>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </div>

            <div className="flex flex-col gap-2 border-t border-[#e2e0dc] p-3">
              <input
                className={inputStyleSm + " w-full"}
                placeholder="Buscar…"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
              />
              <select className={inputStyleSm + " w-full"} value={filterCategoria} onChange={(e) => setFilterCategoria(e.target.value)}>
                <option value="">Todas las categorías</option>
                {CATEGORIAS.map((c) => (
                  <option key={c} value={c}>
                    {c}
                  </option>
                ))}
              </select>
              <label className="flex items-center gap-2 text-xs text-[#606060]">
                <input type="checkbox" checked={verAnteriores} onChange={(e) => setVerAnteriores(e.target.checked)} />
                Ver también versiones anteriores ({anteriores.size})
              </label>
              {sinFecha.length > 0 && (
                <button
                  type="button"
                  onClick={leerFechas}
                  disabled={!!leyendoFechas}
                  className="flex items-center justify-center gap-1.5 rounded-md border border-[#e2e0dc] px-2 py-1 text-xs text-[#606060] hover:bg-[#f5f4f2] disabled:opacity-60"
                  title="La IA lee la fecha y la versión de cada PDF para quedarse siempre con la más reciente"
                >
                  {leyendoFechas ? <Loader2 size={12} className="animate-spin" /> : <Sparkles size={12} />}
                  {leyendoFechas ? `Leyendo fechas… ${leyendoFechas.hechas}/${leyendoFechas.total}` : `Leer fecha de ${sinFecha.length} ficha(s) con IA`}
                </button>
              )}
              <select className={inputStyleSm + " w-full"} value={filterMarca} onChange={(e) => setFilterMarca(e.target.value)}>
                <option value="">Todas las marcas</option>
                {marcasDisponibles.map((m) => (
                  <option key={m} value={m}>
                    {m}
                  </option>
                ))}
              </select>
            </div>

            <div className="flex-1 overflow-y-auto border-t border-[#e2e0dc]">
              {loading ? (
                <div className="flex items-center justify-center gap-2 py-10 text-sm text-[#606060]">
                  <Loader2 size={16} className="animate-spin" /> Cargando…
                </div>
              ) : filtered.length === 0 ? (
                <p className="p-4 text-center text-xs text-[#606060]">
                  {fichas.length === 0 ? "Aún no hay fichas técnicas subidas." : "No hay fichas que coincidan con los filtros."}
                </p>
              ) : (
                filtered.map((f) => (
                  <button
                    key={f.id}
                    onClick={() => setSelectedId(f.id)}
                    className={`block w-full border-b border-[#e2e0dc] px-3 py-2 text-left text-xs hover:bg-[#f5f4f2] ${
                      selectedId === f.id ? "bg-[#f5f4f2]" : ""
                    }`}
                  >
                    <p className="flex items-center gap-1.5 truncate font-medium text-[#282828]">
                      <span className="truncate">{f.modelo || f.nombre_archivo}</span>
                      {anteriores.has(f.id) && <span className="shrink-0 rounded bg-[#efefec] px-1 py-0.5 text-[10px] font-semibold uppercase text-[#8a8a8a]">Anterior</span>}
                    </p>
                    <p className="truncate text-[#606060]">
                      {[f.categoria, f.marca, etiquetaFecha(f)].filter(Boolean).join(" · ") || "Sin clasificar"}
                    </p>
                  </button>
                ))
              )}
            </div>
          </div>

          <div className="flex flex-1 flex-col overflow-hidden">
            {!selected ? (
              <div className="flex flex-1 items-center justify-center p-8 text-center text-sm text-[#606060]">
                Selecciona una ficha técnica de la lista para verla aquí.
              </div>
            ) : (
              <>
                <div className="grid grid-cols-1 gap-3 border-b border-[#e2e0dc] p-4 sm:grid-cols-5">
                  <Field label="Categoría">
                    <select
                      className={inputStyleSm + " w-full"}
                      value={selected.categoria}
                      onChange={(e) => patchFicha(selected.id, { categoria: e.target.value })}
                    >
                      <option value="">—</option>
                      {CATEGORIAS.map((c) => (
                        <option key={c} value={c}>
                          {c}
                        </option>
                      ))}
                    </select>
                  </Field>
                  <Field label="Tipo">
                    <input
                      className={inputStyleSm + " w-full"}
                      defaultValue={selected.tipo_producto ?? ""}
                      key={selected.id + "-tipo"}
                      onBlur={(e) => patchFicha(selected.id, { tipo_producto: e.target.value || null })}
                    />
                  </Field>
                  <Field label="Marca">
                    <input
                      className={inputStyleSm + " w-full"}
                      defaultValue={selected.marca ?? ""}
                      key={selected.id + "-marca"}
                      onBlur={(e) => patchFicha(selected.id, { marca: e.target.value || null })}
                    />
                  </Field>
                  <Field label="Modelo">
                    <input
                      className={inputStyleSm + " w-full"}
                      defaultValue={selected.modelo ?? ""}
                      key={selected.id + "-modelo"}
                      onBlur={(e) => patchFicha(selected.id, { modelo: e.target.value || null })}
                    />
                  </Field>
                  <div className="flex items-end gap-1.5">
                    <Button
                      variant="ghost-light"
                      className="flex-1 justify-center"
                      onClick={() => handleRefillWithAI(selected)}
                      disabled={refillingId === selected.id}
                    >
                      {refillingId === selected.id ? <Loader2 size={13} className="animate-spin" /> : <Sparkles size={13} />}
                      IA
                    </Button>
                    <button onClick={() => handleDownload(selected.id)} className="rounded-md border border-[#e2e0dc] p-1.5 text-[#606060] hover:bg-[#f5f4f2]" aria-label="Descargar">
                      <Download size={15} />
                    </button>
                    <button onClick={() => handleDelete(selected)} className="rounded-md border border-[#e2e0dc] p-1.5 text-[#606060] hover:bg-[#f5f4f2]" aria-label="Borrar">
                      <Trash2 size={15} />
                    </button>
                  </div>
                </div>
                <div className="flex flex-wrap items-end gap-3 px-4 pt-2 text-xs text-[#606060]">
                  <Field label="Fecha del documento">
                    <input
                      type="date"
                      className={inputStyleSm}
                      defaultValue={selected.fecha_documento?.slice(0, 10) ?? ""}
                      key={selected.id + "-fecha"}
                      onBlur={(e) => patchFicha(selected.id, { fecha_documento: e.target.value || null })}
                    />
                  </Field>
                  <Field label="Versión">
                    <input
                      className={inputStyleSm + " w-28"}
                      defaultValue={selected.version ?? ""}
                      key={selected.id + "-version"}
                      onBlur={(e) => patchFicha(selected.id, { version: e.target.value || null })}
                    />
                  </Field>
                  <span className="pb-1.5">{selected.nombre_archivo}</span>
                </div>
                {anteriores.has(selected.id) && (
                  <p className="mx-4 mt-2 rounded-md bg-[#fff4e0] px-3 py-1.5 text-xs text-[#9a5b00]">
                    Hay una ficha más reciente de este producto:{" "}
                    <button type="button" className="font-semibold underline" onClick={() => setSelectedId(anteriores.get(selected.id)!.id)}>
                      {anteriores.get(selected.id)!.nombre_archivo}
                    </button>
                    . El cotizador usa siempre la más reciente; si esta ya no vale, puedes borrarla.
                  </p>
                )}
                <div className="flex-1 overflow-hidden p-4 pt-2">
                  {previewLoading ? (
                    <div className="flex h-full items-center justify-center gap-2 text-sm text-[#606060]">
                      <Loader2 size={16} className="animate-spin" /> Cargando vista previa…
                    </div>
                  ) : previewUrl ? (
                    <iframe src={previewUrl} title={selected.nombre_archivo} className="h-full w-full rounded border border-[#e2e0dc]" />
                  ) : (
                    <div className="flex h-full items-center justify-center text-sm text-[#606060]">
                      No se pudo cargar la vista previa.
                    </div>
                  )}
                </div>
              </>
            )}
          </div>
        </div>
      </div>
    </Overlay>
  );
}

/** "2024", "mar 2025", "v07"… para la lista. */
function etiquetaFecha(f: FichaTecnica): string {
  const d = fechaDeFicha(f);
  const partes: string[] = [];
  if (d) {
    const [y, m] = d.split("-");
    partes.push(f.fecha_documento && m !== "01" ? `${["ene", "feb", "mar", "abr", "may", "jun", "jul", "ago", "sep", "oct", "nov", "dic"][Number(m) - 1]} ${y}` : y);
  }
  if (f.version) partes.push(f.version);
  return partes.join(" ");
}
