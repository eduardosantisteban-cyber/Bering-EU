"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Download, Loader2, Trash2, Upload, X } from "lucide-react";
import { CATEGORIAS } from "@/lib/constants";
import { normalizeMarca, normalizeStr } from "@/lib/format";
import {
  createFicha,
  deleteFicha,
  discardUploadedFicha,
  fetchFichas,
  getFichaDownloadUrl,
  requestFichaUploadUrl,
  updateFicha,
} from "@/lib/apiClient";
import { putFileToSignedUrl } from "@/lib/uploadDirect";
import type { FichaTecnica } from "@/lib/types";
import { ModalHeader, Overlay, inputStyleSm } from "./ui";

interface QueueEntry {
  localId: string;
  filename: string;
  status: "subiendo" | "error";
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
    return out;
  }, [fichas, filterCategoria, filterMarca, search]);

  async function uploadOne(file: File) {
    const localId = localUid();
    setQueue((q) => [...q, { localId, filename: file.name, status: "subiendo", error: null }]);
    try {
      const { id, path, signedUrl } = await requestFichaUploadUrl(file.name);
      await putFileToSignedUrl(signedUrl, file);
      const ficha = await createFicha({
        id,
        categoria: "",
        tipo_producto: null,
        marca: null,
        modelo: null,
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

  async function patchFicha(id: string, patch: Partial<Pick<FichaTecnica, "categoria" | "tipo_producto" | "marca" | "modelo">>) {
    const previous = fichas;
    setFichas((prev) => prev.map((f) => (f.id === id ? { ...f, ...patch } : f)));
    try {
      await updateFicha(id, patch);
    } catch (err) {
      setFichas(previous);
      onNotice("error", "No se pudo guardar el cambio: " + (err as Error).message);
    }
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
      onNotice("success", "Ficha técnica borrada.");
    } catch (err) {
      onNotice("error", "No se pudo borrar: " + (err as Error).message);
    }
  }

  return (
    <Overlay onClose={onClose}>
      <div className="flex max-h-[90vh] w-[min(1100px,96vw)] flex-col rounded-xl bg-white">
        <ModalHeader
          title="Fichas técnicas"
          subtitle="Especificaciones de producto para consultar y descargar"
          onClose={onClose}
        />
        <div className="flex-1 overflow-y-auto p-5">
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
            className="mb-4 flex w-full flex-col items-center justify-center gap-2 rounded-lg border-2 border-dashed border-[#e2e0dc] py-6 text-[#606060] hover:border-[#e83038] hover:text-[#e83038]"
          >
            <Upload size={22} />
            <span className="text-sm">Haz clic para subir una o varias fichas técnicas (PDF)</span>
          </button>

          {queue.length > 0 && (
            <div className="mb-4 flex flex-col gap-1.5">
              {queue.map((e) => (
                <div
                  key={e.localId}
                  className={`flex items-center justify-between rounded-md border px-3 py-1.5 text-xs ${
                    e.status === "error" ? "border-[#e83038]/40 text-[#e83038]" : "border-[#e2e0dc] text-[#606060]"
                  }`}
                >
                  <span className="flex items-center gap-2 truncate">
                    {e.status === "subiendo" && <Loader2 size={13} className="animate-spin shrink-0" />}
                    <span className="truncate">{e.filename}</span>
                    {e.status === "error" && <span className="truncate">— {e.error}</span>}
                  </span>
                  {e.status === "error" && (
                    <button onClick={() => discardQueueEntry(e.localId)} className="shrink-0 rounded p-1 hover:bg-[#e83038]/5">
                      <X size={13} />
                    </button>
                  )}
                </div>
              ))}
            </div>
          )}

          <div className="mb-3 flex flex-wrap items-center gap-2">
            <input
              className={inputStyleSm + " min-w-[200px] flex-1"}
              placeholder="Buscar por tipo, marca, modelo o archivo…"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
            <select className={inputStyleSm} value={filterCategoria} onChange={(e) => setFilterCategoria(e.target.value)}>
              <option value="">Todas las categorías</option>
              {CATEGORIAS.map((c) => (
                <option key={c} value={c}>
                  {c}
                </option>
              ))}
            </select>
            <select className={inputStyleSm} value={filterMarca} onChange={(e) => setFilterMarca(e.target.value)}>
              <option value="">Todas las marcas</option>
              {marcasDisponibles.map((m) => (
                <option key={m} value={m}>
                  {m}
                </option>
              ))}
            </select>
          </div>

          {loading ? (
            <div className="flex items-center justify-center gap-2 py-16 text-[#606060]">
              <Loader2 size={18} className="animate-spin" /> Cargando…
            </div>
          ) : filtered.length === 0 ? (
            <p className="py-16 text-center text-sm text-[#606060]">
              {fichas.length === 0 ? "Aún no hay fichas técnicas subidas." : "No hay fichas que coincidan con los filtros."}
            </p>
          ) : (
            <div className="overflow-x-auto rounded border border-[#e2e0dc]">
              <table className="w-full min-w-[820px] text-xs">
                <thead className="bg-[#f5f4f2] text-left text-[#606060]">
                  <tr>
                    <th className="px-2 py-1.5">Categoría</th>
                    <th className="px-2 py-1.5">Tipo</th>
                    <th className="px-2 py-1.5">Marca</th>
                    <th className="px-2 py-1.5">Modelo</th>
                    <th className="px-2 py-1.5">Archivo</th>
                    <th className="px-2 py-1.5"></th>
                  </tr>
                </thead>
                <tbody>
                  {filtered.map((f) => (
                    <tr key={f.id} className="border-t border-[#e2e0dc]">
                      <td className="px-2 py-1">
                        <select
                          className={inputStyleSm + " w-full"}
                          value={f.categoria}
                          onChange={(e) => patchFicha(f.id, { categoria: e.target.value })}
                        >
                          <option value="">—</option>
                          {CATEGORIAS.map((c) => (
                            <option key={c} value={c}>
                              {c}
                            </option>
                          ))}
                        </select>
                      </td>
                      <td className="px-2 py-1">
                        <input
                          className={inputStyleSm + " w-28"}
                          defaultValue={f.tipo_producto ?? ""}
                          onBlur={(e) => patchFicha(f.id, { tipo_producto: e.target.value || null })}
                        />
                      </td>
                      <td className="px-2 py-1">
                        <input
                          className={inputStyleSm + " w-28"}
                          defaultValue={f.marca ?? ""}
                          onBlur={(e) => patchFicha(f.id, { marca: e.target.value || null })}
                        />
                      </td>
                      <td className="px-2 py-1">
                        <input
                          className={inputStyleSm + " w-32"}
                          defaultValue={f.modelo ?? ""}
                          onBlur={(e) => patchFicha(f.id, { modelo: e.target.value || null })}
                        />
                      </td>
                      <td className="max-w-[220px] truncate px-2 py-1" title={f.nombre_archivo}>
                        {f.nombre_archivo}
                      </td>
                      <td className="px-2 py-1">
                        <div className="flex items-center justify-end gap-1">
                          <button onClick={() => handleDownload(f.id)} className="rounded p-1 text-[#606060] hover:bg-[#f5f4f2]" aria-label="Ver / descargar">
                            <Download size={14} />
                          </button>
                          <button onClick={() => handleDelete(f)} className="rounded p-1 text-[#606060] hover:bg-[#f5f4f2]" aria-label="Borrar">
                            <Trash2 size={14} />
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>
    </Overlay>
  );
}
