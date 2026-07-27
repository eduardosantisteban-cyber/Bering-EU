"use client";

import { useEffect, useMemo, useState } from "react";
import { ExternalLink, Plus, Save, Trash2 } from "lucide-react";
import { CATEGORIAS } from "@/lib/constants";
import type { Presupuesto, PresupuestoItem } from "@/lib/types";
import { deletePresupuesto, getPdfUrl, updatePresupuesto } from "@/lib/apiClient";
import { driveEmbedUrl } from "@/lib/format";
import { Button, Field, inputStyleSm, ModalHeader, Overlay } from "./ui";

function localUid(): string {
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
}

export default function DetailModal({
  presupuesto,
  onClose,
  onUpdated,
  onDeleted,
  onError,
}: {
  presupuesto: Presupuesto;
  onClose: () => void;
  onUpdated: (p: Presupuesto) => void;
  onDeleted: (id: string) => void;
  onError: (message: string) => void;
}) {
  const [proveedor, setProveedor] = useState(presupuesto.proveedor);
  const [numero, setNumero] = useState(presupuesto.numero_presupuesto ?? "");
  const [fecha, setFecha] = useState(presupuesto.fecha_presupuesto ?? "");
  const [driveUrl, setDriveUrl] = useState(presupuesto.drive_url ?? "");
  const [items, setItems] = useState<PresupuestoItem[]>(presupuesto.items);
  const [saving, setSaving] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [pdfUrl, setPdfUrl] = useState<string | null>(null);

  useEffect(() => {
    if (presupuesto.pdf_storage_path) {
      getPdfUrl(presupuesto.id)
        .then(setPdfUrl)
        .catch(() => setPdfUrl(null));
    }
  }, [presupuesto.id, presupuesto.pdf_storage_path]);

  const driveEmbed = useMemo(() => driveEmbedUrl(driveUrl), [driveUrl]);

  function updateItem(idx: number, field: keyof PresupuestoItem, value: unknown) {
    setItems((prev) => prev.map((it, i) => (i === idx ? { ...it, [field]: value } : it)));
  }

  function addItem() {
    const maxGrupo = items.reduce((m, it) => Math.max(m, it.grupo || 0), 0);
    setItems((prev) => [
      ...prev,
      {
        id: localUid(),
        presupuesto_id: presupuesto.id,
        codigo_articulo: null,
        categoria: "",
        tipo_producto: null,
        marca: proveedor,
        modelo: null,
        medidas: null,
        precio_unitario: null,
        moneda: "EUR",
        cantidad: 1,
        es_accesorio: false,
        grupo: maxGrupo + 1,
        notas: null,
      },
    ]);
  }

  function removeItem(idx: number) {
    setItems((prev) => prev.filter((_, i) => i !== idx));
  }

  async function handleSave() {
    setSaving(true);
    try {
      const saved = await updatePresupuesto(presupuesto.id, {
        proveedor,
        numero_presupuesto: numero || null,
        fecha_presupuesto: fecha || null,
        drive_url: driveUrl || null,
        items,
      });
      onUpdated(saved);
    } catch (err) {
      onError("No se pudo guardar el cambio: " + (err as Error).message);
    } finally {
      setSaving(false);
    }
  }

  async function handleDelete() {
    try {
      await deletePresupuesto(presupuesto.id);
      onDeleted(presupuesto.id);
    } catch (err) {
      onError("No se pudo borrar: " + (err as Error).message);
    }
  }

  return (
    <Overlay onClose={onClose}>
      <div className="flex max-h-[90vh] w-[min(1200px,96vw)] flex-col rounded-xl bg-white">
        <ModalHeader
          title={proveedor || "Presupuesto"}
          subtitle={numero ? `Ref. ${numero}` : null}
          onClose={onClose}
        />
        <div className="grid flex-1 grid-cols-1 gap-5 overflow-y-auto p-5 lg:grid-cols-[1.3fr_1fr]">
          <div>
            <div className="mb-4 grid grid-cols-1 gap-3 sm:grid-cols-2">
              <Field label="Proveedor">
                <input className={inputStyleSm + " w-full"} value={proveedor} onChange={(e) => setProveedor(e.target.value)} />
              </Field>
              <Field label="Nº presupuesto">
                <input className={inputStyleSm + " w-full"} value={numero} onChange={(e) => setNumero(e.target.value)} />
              </Field>
              <Field label="Fecha">
                <input type="date" className={inputStyleSm + " w-full"} value={fecha} onChange={(e) => setFecha(e.target.value)} />
              </Field>
              <Field label="Enlace Google Drive">
                <input
                  className={inputStyleSm + " w-full"}
                  placeholder="https://drive.google.com/..."
                  value={driveUrl}
                  onChange={(e) => setDriveUrl(e.target.value)}
                />
              </Field>
            </div>

            <div className="overflow-x-auto rounded border border-[#e2e0dc]">
              <table className="w-full min-w-[820px] text-xs">
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
                  {items.map((it, idx) => (
                    <tr key={it.id} className="border-t border-[#e2e0dc]">
                      <td className="px-2 py-1">
                        <select
                          className={inputStyleSm + " w-full"}
                          value={it.categoria}
                          onChange={(e) => updateItem(idx, "categoria", e.target.value)}
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
                        <input className={inputStyleSm + " w-28"} value={it.tipo_producto ?? ""} onChange={(e) => updateItem(idx, "tipo_producto", e.target.value)} />
                      </td>
                      <td className="px-2 py-1">
                        <input className={inputStyleSm + " w-36"} value={it.modelo ?? ""} onChange={(e) => updateItem(idx, "modelo", e.target.value)} />
                      </td>
                      <td className="px-2 py-1">
                        <input className={inputStyleSm + " w-24"} value={it.medidas ?? ""} onChange={(e) => updateItem(idx, "medidas", e.target.value)} />
                      </td>
                      <td className="px-2 py-1">
                        <input
                          type="number"
                          step="0.01"
                          className={inputStyleSm + " w-20"}
                          value={it.precio_unitario ?? ""}
                          onChange={(e) => updateItem(idx, "precio_unitario", e.target.value === "" ? null : Number(e.target.value))}
                        />
                      </td>
                      <td className="px-2 py-1">
                        <input
                          type="number"
                          className={inputStyleSm + " w-14"}
                          value={it.cantidad}
                          onChange={(e) => updateItem(idx, "cantidad", Number(e.target.value) || 0)}
                        />
                      </td>
                      <td className="px-2 py-1 text-center">
                        <input type="checkbox" checked={it.es_accesorio} onChange={(e) => updateItem(idx, "es_accesorio", e.target.checked)} />
                      </td>
                      <td className="px-2 py-1">
                        <input
                          type="number"
                          className={inputStyleSm + " w-12"}
                          value={it.grupo}
                          onChange={(e) => updateItem(idx, "grupo", Number(e.target.value) || 1)}
                        />
                      </td>
                      <td className="px-2 py-1">
                        <button onClick={() => removeItem(idx)} className="rounded p-1 text-[#606060] hover:bg-[#f5f4f2]">
                          <Trash2 size={14} />
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            <div className="mt-3 flex items-center justify-between">
              <button onClick={addItem} className="flex items-center gap-1 text-xs text-[#606060] hover:text-[#e83038]">
                <Plus size={14} /> Añadir línea
              </button>
              <div className="flex items-center gap-2">
                {!confirmDelete ? (
                  <Button variant="danger" onClick={() => setConfirmDelete(true)}>
                    Eliminar
                  </Button>
                ) : (
                  <>
                    <span className="text-xs text-[#606060]">¿Seguro?</span>
                    <Button variant="danger" onClick={handleDelete}>
                      Sí, eliminar
                    </Button>
                    <Button variant="ghost-light" onClick={() => setConfirmDelete(false)}>
                      Cancelar
                    </Button>
                  </>
                )}
                <Button variant="primary" onClick={handleSave} disabled={saving}>
                  <Save size={14} /> {saving ? "Guardando…" : "Guardar cambios"}
                </Button>
              </div>
            </div>
          </div>

          <div className="flex flex-col rounded-lg border border-[#e2e0dc]">
            <div className="flex items-center justify-between border-b border-[#e2e0dc] px-3 py-2 text-xs text-[#606060]">
              <span>Documento original</span>
              {driveUrl && (
                <a
                  href={driveUrl}
                  target="_blank"
                  rel="noreferrer"
                  className="flex items-center gap-1 text-[#e83038] hover:underline"
                >
                  Abrir en Drive <ExternalLink size={12} />
                </a>
              )}
            </div>
            {pdfUrl ? (
              <iframe src={pdfUrl} className="min-h-[420px] flex-1" title="PDF" />
            ) : driveEmbed ? (
              <iframe src={driveEmbed} className="min-h-[420px] flex-1" title="PDF (Drive)" />
            ) : (
              <div className="flex-1 p-4 text-xs text-[#606060]">
                No hay copia del PDF disponible. Pega un enlace de Drive arriba para consultarlo desde aquí.
              </div>
            )}
          </div>
        </div>
      </div>
    </Overlay>
  );
}
