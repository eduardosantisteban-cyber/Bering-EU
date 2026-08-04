"use client";

import { useCallback, useRef, useState } from "react";
import { Loader2, Plus, Trash2, Upload, X } from "lucide-react";
import { CATEGORIAS } from "@/lib/constants";
import type { ExtractedPresupuesto, ExtractedItem } from "@/lib/types";
import { createPresupuesto, discardUploadedPdf, extractPdf, requestUploadUrl } from "@/lib/apiClient";
import { Button, Field, Overlay, ModalHeader, inputStyleSm } from "./ui";

type Status = "pendiente" | "subiendo" | "procesando" | "revision" | "guardando" | "error";

interface QueueEntry {
  localId: string;
  file: File;
  status: Status;
  presupuestoId: string | null;
  storagePath: string | null;
  extracted: ExtractedPresupuesto | null;
  error: string | null;
  rawResponse: string | null;
  driveUrl: string;
}

function localUid(): string {
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
}

function emptyItem(grupo: number): ExtractedItem {
  return {
    codigo_articulo: null,
    categoria: "",
    tipo_producto: null,
    marca: null,
    modelo: null,
    medidas: null,
    precio_unitario: null,
    moneda: "EUR",
    cantidad: 1,
    es_accesorio: false,
    grupo,
    notas: null,
  };
}

async function uploadFileDirect(file: File): Promise<{ id: string; path: string }> {
  const { id, path, signedUrl } = await requestUploadUrl(file.name);

  // PUT directo a la URL que ya firmó y validó Supabase en el servidor,
  // sin que el navegador tenga que reconstruirla a partir de la ruta y el
  // token (eso es lo que daba "Invalid path specified in request URL" con
  // el cliente de Supabase, sin llegar a identificar la causa exacta).
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!anonKey) {
    throw new Error("Falta NEXT_PUBLIC_SUPABASE_ANON_KEY en las variables de entorno");
  }
  const res = await fetch(signedUrl, {
    method: "PUT",
    headers: {
      apikey: anonKey,
      Authorization: `Bearer ${anonKey}`,
      "Content-Type": "application/pdf",
    },
    body: file,
  });
  if (!res.ok) {
    const detail = await res.text().catch(() => "");
    throw new Error(`No se pudo subir el PDF (HTTP ${res.status}): ${detail.slice(0, 300) || res.statusText}`);
  }
  return { id, path };
}

export default function UploadModal({
  onClose,
  onSaved,
  onError,
}: {
  onClose: () => void;
  onSaved: (proveedor: string) => void;
  onError: (message: string) => void;
}) {
  const [queue, setQueue] = useState<QueueEntry[]>([]);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const patchEntry = useCallback((localId: string, patch: Partial<QueueEntry>) => {
    setQueue((q) => q.map((e) => (e.localId === localId ? { ...e, ...patch } : e)));
  }, []);

  const processEntry = useCallback(
    async (entry: QueueEntry) => {
      patchEntry(entry.localId, { status: "subiendo" });
      try {
        const { id, path } = await uploadFileDirect(entry.file);
        patchEntry(entry.localId, { status: "procesando", presupuestoId: id, storagePath: path });
        const extracted = await extractPdf(path);
        patchEntry(entry.localId, { status: "revision", extracted });
      } catch (err) {
        const e = err as Error & { rawResponse?: string };
        patchEntry(entry.localId, {
          status: "error",
          error: e.message || "Error al procesar el PDF",
          rawResponse: e.rawResponse ?? null,
          extracted: { proveedor: "", numero_presupuesto: null, fecha_presupuesto: null, items: [emptyItem(1)] },
        });
      }
    },
    [patchEntry]
  );

  function onFilesSelected(fileList: FileList | null) {
    if (!fileList) return;
    const files = Array.from(fileList).filter((f) => f.type === "application/pdf");
    if (!files.length) return;
    const entries: QueueEntry[] = files.map((file) => ({
      localId: localUid(),
      file,
      status: "pendiente",
      presupuestoId: null,
      storagePath: null,
      extracted: null,
      error: null,
      rawResponse: null,
      driveUrl: "",
    }));
    setQueue((q) => [...q, ...entries]);
    (async () => {
      for (const entry of entries) {
        await processEntry(entry);
      }
    })();
  }

  async function retryEntry(localId: string) {
    const entry = queue.find((e) => e.localId === localId);
    if (!entry) return;
    patchEntry(localId, { status: "procesando", error: null, rawResponse: null });
    try {
      // Si el PDF ya se subió (el fallo fue solo en la extracción, no en la
      // subida), no hace falta volver a subirlo.
      const { id, path } =
        entry.storagePath && entry.presupuestoId
          ? { id: entry.presupuestoId, path: entry.storagePath }
          : await uploadFileDirect(entry.file);
      if (!entry.storagePath) patchEntry(localId, { presupuestoId: id, storagePath: path });
      const extracted = await extractPdf(path);
      patchEntry(localId, { status: "revision", extracted });
    } catch (err) {
      const e = err as Error & { rawResponse?: string };
      patchEntry(localId, {
        status: "error",
        error: e.message || "Error al procesar el PDF",
        rawResponse: e.rawResponse ?? null,
      });
    }
  }

  function discardEntry(localId: string) {
    const entry = queue.find((e) => e.localId === localId);
    setQueue((q) => q.filter((e) => e.localId !== localId));
    if (entry?.storagePath) {
      discardUploadedPdf(entry.storagePath);
    }
  }

  function updateField(localId: string, field: "proveedor" | "numero_presupuesto" | "fecha_presupuesto", value: string) {
    setQueue((q) =>
      q.map((e) => {
        if (e.localId !== localId || !e.extracted) return e;
        const ex = { ...e.extracted, [field]: value };
        if (field === "proveedor") {
          ex.items = ex.items.map((it) => ({ ...it, marca: value }));
        }
        return { ...e, extracted: ex };
      })
    );
  }

  function updateDriveUrl(localId: string, value: string) {
    patchEntry(localId, { driveUrl: value });
  }

  function updateItem(localId: string, idx: number, field: keyof ExtractedItem, value: unknown) {
    setQueue((q) =>
      q.map((e) => {
        if (e.localId !== localId || !e.extracted) return e;
        const items = e.extracted.items.map((it, i) => (i === idx ? { ...it, [field]: value } : it));
        return { ...e, extracted: { ...e.extracted, items } };
      })
    );
  }

  function addItemRow(localId: string) {
    setQueue((q) =>
      q.map((e) => {
        if (e.localId !== localId || !e.extracted) return e;
        const maxGrupo = e.extracted.items.reduce((m, it) => Math.max(m, it.grupo || 0), 0);
        return {
          ...e,
          extracted: {
            ...e.extracted,
            items: [...e.extracted.items, { ...emptyItem(maxGrupo + 1), marca: e.extracted.proveedor || null }],
          },
        };
      })
    );
  }

  function removeItemRow(localId: string, idx: number) {
    setQueue((q) =>
      q.map((e) =>
        e.localId === localId && e.extracted
          ? { ...e, extracted: { ...e.extracted, items: e.extracted.items.filter((_, i) => i !== idx) } }
          : e
      )
    );
  }

  async function saveEntry(entry: QueueEntry) {
    if (!entry.extracted || !entry.storagePath || !entry.presupuestoId) return;
    patchEntry(entry.localId, { status: "guardando" });
    try {
      await createPresupuesto({
        id: entry.presupuestoId,
        proveedor: entry.extracted.proveedor || "",
        numero_presupuesto: entry.extracted.numero_presupuesto,
        fecha_presupuesto: entry.extracted.fecha_presupuesto,
        pdf_filename: entry.file.name,
        drive_url: entry.driveUrl || null,
        items: entry.extracted.items,
        pdf_storage_path: entry.storagePath,
      });
      discardEntry(entry.localId);
      onSaved(entry.extracted.proveedor || "proveedor");
    } catch (err) {
      onError("No se pudo guardar: " + (err as Error).message);
      patchEntry(entry.localId, { status: "revision" });
    }
  }

  return (
    <Overlay onClose={onClose}>
      <div className="flex max-h-[90vh] w-[min(1100px,95vw)] flex-col rounded-xl bg-white">
        <ModalHeader title="Subir presupuestos (PDF)" onClose={onClose} />
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
            className="flex w-full flex-col items-center justify-center gap-2 rounded-lg border-2 border-dashed border-[#e2e0dc] py-10 text-[#606060] hover:border-[#e83038] hover:text-[#e83038]"
          >
            <Upload size={28} />
            <span className="text-sm">Haz clic para elegir uno o varios PDF</span>
          </button>

          {queue.length === 0 && (
            <p className="mt-6 text-center text-sm text-[#606060]">
              Sube el PDF de un presupuesto de proveedor. La IA extraerá proveedor, líneas,
              precios y categorías automáticamente para que las revises antes de guardar.
            </p>
          )}

          <div className="mt-6 flex flex-col gap-6">
            {queue.map((entry) => (
              <QueueEntryCard
                key={entry.localId}
                entry={entry}
                onDiscard={() => discardEntry(entry.localId)}
                onRetry={() => retryEntry(entry.localId)}
                onSave={() => saveEntry(entry)}
                onUpdateField={(field, value) => updateField(entry.localId, field, value)}
                onUpdateDriveUrl={(value) => updateDriveUrl(entry.localId, value)}
                onUpdateItem={(idx, field, value) => updateItem(entry.localId, idx, field, value)}
                onAddItem={() => addItemRow(entry.localId)}
                onRemoveItem={(idx) => removeItemRow(entry.localId, idx)}
              />
            ))}
          </div>
        </div>
      </div>
    </Overlay>
  );
}

function QueueEntryCard({
  entry,
  onDiscard,
  onRetry,
  onSave,
  onUpdateField,
  onUpdateDriveUrl,
  onUpdateItem,
  onAddItem,
  onRemoveItem,
}: {
  entry: QueueEntry;
  onDiscard: () => void;
  onRetry: () => void;
  onSave: () => void;
  onUpdateField: (field: "proveedor" | "numero_presupuesto" | "fecha_presupuesto", value: string) => void;
  onUpdateDriveUrl: (value: string) => void;
  onUpdateItem: (idx: number, field: keyof ExtractedItem, value: unknown) => void;
  onAddItem: () => void;
  onRemoveItem: (idx: number) => void;
}) {
  const busy = entry.status === "subiendo" || entry.status === "procesando" || entry.status === "guardando";

  return (
    <div className="rounded-lg border border-[#e2e0dc]">
      <div className="flex items-center justify-between border-b border-[#e2e0dc] bg-[#f5f4f2] px-4 py-2">
        <span className="truncate text-sm font-medium text-[#282828]">{entry.file.name}</span>
        <div className="flex items-center gap-2">
          {busy && (
            <span className="flex items-center gap-1 text-xs text-[#606060]">
              <Loader2 size={14} className="animate-spin" />
              {entry.status === "subiendo" && "Subiendo…"}
              {entry.status === "procesando" && "Analizando con IA…"}
              {entry.status === "guardando" && "Guardando…"}
            </span>
          )}
          {entry.status !== "guardando" && (
            <button onClick={onDiscard} className="rounded p-1 text-[#606060] hover:bg-white" aria-label="Descartar">
              <X size={16} />
            </button>
          )}
        </div>
      </div>

      {entry.status === "error" && (
        <div className="p-4">
          <p className="mb-2 text-sm text-[#e83038]">{entry.error}</p>
          <Button variant="ghost-light" onClick={onRetry}>
            Reintentar
          </Button>
        </div>
      )}

      {entry.status === "revision" && entry.extracted && (
        <div className="p-4">
          <div className="mb-4 grid grid-cols-1 gap-3 sm:grid-cols-4">
            <Field label="Proveedor">
              <input
                className={inputStyleSm + " w-full"}
                value={entry.extracted.proveedor}
                onChange={(e) => onUpdateField("proveedor", e.target.value)}
              />
            </Field>
            <Field label="Nº presupuesto">
              <input
                className={inputStyleSm + " w-full"}
                value={entry.extracted.numero_presupuesto ?? ""}
                onChange={(e) => onUpdateField("numero_presupuesto", e.target.value)}
              />
            </Field>
            <Field label="Fecha">
              <input
                type="date"
                className={inputStyleSm + " w-full"}
                value={entry.extracted.fecha_presupuesto ?? ""}
                onChange={(e) => onUpdateField("fecha_presupuesto", e.target.value)}
              />
            </Field>
            <Field label="Enlace Google Drive">
              <input
                className={inputStyleSm + " w-full"}
                placeholder="https://drive.google.com/..."
                value={entry.driveUrl}
                onChange={(e) => onUpdateDriveUrl(e.target.value)}
              />
            </Field>
          </div>

          <div className="overflow-x-auto rounded border border-[#e2e0dc]">
            <table className="w-full min-w-[900px] text-xs">
              <thead className="bg-[#f5f4f2] text-left text-[#606060]">
                <tr>
                  <th className="px-2 py-1.5">Categoría</th>
                  <th className="px-2 py-1.5">Tipo</th>
                  <th className="px-2 py-1.5">Modelo</th>
                  <th className="px-2 py-1.5">Medidas</th>
                  <th className="px-2 py-1.5">Precio</th>
                  <th className="px-2 py-1.5">Cant.</th>
                  <th className="px-2 py-1.5">Accesorio</th>
                  <th className="px-2 py-1.5">Grupo</th>
                  <th className="px-2 py-1.5"></th>
                </tr>
              </thead>
              <tbody>
                {entry.extracted.items.map((it, idx) => (
                  <tr key={idx} className="border-t border-[#e2e0dc]">
                    <td className="px-2 py-1">
                      <select
                        className={inputStyleSm + " w-full"}
                        value={it.categoria}
                        onChange={(e) => onUpdateItem(idx, "categoria", e.target.value)}
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
                        className={inputStyleSm + " w-32"}
                        value={it.tipo_producto ?? ""}
                        onChange={(e) => onUpdateItem(idx, "tipo_producto", e.target.value)}
                      />
                    </td>
                    <td className="px-2 py-1">
                      <input
                        className={inputStyleSm + " w-40"}
                        value={it.modelo ?? ""}
                        onChange={(e) => onUpdateItem(idx, "modelo", e.target.value)}
                      />
                    </td>
                    <td className="px-2 py-1">
                      <input
                        className={inputStyleSm + " w-28"}
                        value={it.medidas ?? ""}
                        onChange={(e) => onUpdateItem(idx, "medidas", e.target.value)}
                      />
                    </td>
                    <td className="px-2 py-1">
                      <input
                        type="number"
                        step="0.01"
                        className={inputStyleSm + " w-24"}
                        value={it.precio_unitario ?? ""}
                        onChange={(e) => onUpdateItem(idx, "precio_unitario", e.target.value === "" ? null : Number(e.target.value))}
                      />
                    </td>
                    <td className="px-2 py-1">
                      <input
                        type="number"
                        step="1"
                        className={inputStyleSm + " w-16"}
                        value={it.cantidad ?? 1}
                        onChange={(e) => onUpdateItem(idx, "cantidad", e.target.value === "" ? 1 : Number(e.target.value))}
                      />
                    </td>
                    <td className="px-2 py-1 text-center">
                      <input
                        type="checkbox"
                        checked={it.es_accesorio}
                        onChange={(e) => onUpdateItem(idx, "es_accesorio", e.target.checked)}
                      />
                    </td>
                    <td className="px-2 py-1">
                      <input
                        type="number"
                        className={inputStyleSm + " w-14"}
                        value={it.grupo}
                        onChange={(e) => onUpdateItem(idx, "grupo", Number(e.target.value) || 1)}
                      />
                    </td>
                    <td className="px-2 py-1">
                      <button onClick={() => onRemoveItem(idx)} className="rounded p-1 text-[#606060] hover:bg-[#f5f4f2]">
                        <Trash2 size={14} />
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <div className="mt-3 flex items-center justify-between">
            <button
              onClick={onAddItem}
              className="flex items-center gap-1 text-xs text-[#606060] hover:text-[#e83038]"
            >
              <Plus size={14} /> Añadir línea
            </button>
            <Button variant="primary" onClick={onSave}>
              Guardar presupuesto
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}
