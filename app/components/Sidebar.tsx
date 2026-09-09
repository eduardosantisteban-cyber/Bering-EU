"use client";

import { useRef, useState } from "react";
import { Loader2, X } from "lucide-react";
import { CATEGORIAS } from "@/lib/constants";
import { importBackup } from "@/lib/apiClient";
import { backupFilename, buildBackupPayload, extractBackupList } from "@/lib/backup";
import type { Presupuesto } from "@/lib/types";
import { Button, inputStyleSm } from "./ui";

export default function Sidebar({
  db,
  linesCount,
  dbError,
  onRefresh,
  onNotice,
  filterCategoria,
  setFilterCategoria,
  filterTipo,
  setFilterTipo,
  tiposDisponibles,
  filterMarca,
  setFilterMarca,
  marcasDisponibles,
  filterYear,
  setFilterYear,
  aniosDisponibles,
}: {
  db: Presupuesto[];
  linesCount: number;
  dbError: string | null;
  onRefresh: () => Promise<void>;
  onNotice: (type: "error" | "success", message: string) => void;
  filterCategoria: string;
  setFilterCategoria: (v: string) => void;
  filterTipo: string;
  setFilterTipo: (v: string) => void;
  tiposDisponibles: string[];
  filterMarca: string;
  setFilterMarca: (v: string) => void;
  marcasDisponibles: string[];
  filterYear: string;
  setFilterYear: (v: string) => void;
  aniosDisponibles: string[];
}) {
  const [refreshing, setRefreshing] = useState(false);
  const [importing, setImporting] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const hasActiveFilters = !!(filterCategoria || filterTipo || filterMarca || filterYear);

  function clearFilters() {
    setFilterCategoria("");
    setFilterTipo("");
    setFilterMarca("");
    setFilterYear("");
  }

  async function handleRefresh() {
    setRefreshing(true);
    try {
      await onRefresh();
    } finally {
      setRefreshing(false);
    }
  }

  function handlePrepareBackup() {
    const payload = buildBackupPayload(db);
    const blob = new Blob([JSON.stringify(payload, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = backupFilename();
    a.click();
    URL.revokeObjectURL(url);
  }

  async function handleImportFile(file: File) {
    setImporting(true);
    try {
      const text = await file.text();
      const parsed = JSON.parse(text);
      const records = extractBackupList(parsed);
      if (records.length === 0) {
        onNotice("error", "El archivo no tiene el formato de un backup de presupuestos.");
        return;
      }
      const result = await importBackup(parsed);
      await onRefresh();
      const errorNote = result.errors.length > 0 ? ` (${result.errors.length} con error)` : "";
      onNotice(
        "success",
        `Backup restaurado: ${result.imported} presupuesto(s) importado(s), ${result.skipped} omitido(s) por duplicado${errorNote}.`
      );
    } catch (err) {
      onNotice("error", "No se pudo restaurar el backup: " + (err as Error).message);
    } finally {
      setImporting(false);
    }
  }

  return (
    <aside className="w-[260px] shrink-0 overflow-y-auto border-r border-[#e2e0dc] bg-white p-4">
      <p className="mb-2 text-xs font-semibold tracking-wide text-[#606060]">FILTROS</p>
      <div className="flex flex-col gap-3">
        <label className="flex flex-col gap-1">
          <span className="text-xs text-[#606060]">Categoría</span>
          <select className={inputStyleSm + " w-full"} value={filterCategoria} onChange={(e) => setFilterCategoria(e.target.value)}>
            <option value="">Todas</option>
            {CATEGORIAS.map((c) => (
              <option key={c} value={c}>
                {c}
              </option>
            ))}
          </select>
        </label>
        <label className="flex flex-col gap-1">
          <span className="text-xs text-[#606060]">Tipo de producto</span>
          <select className={inputStyleSm + " w-full"} value={filterTipo} onChange={(e) => setFilterTipo(e.target.value)}>
            <option value="">Todos</option>
            {tiposDisponibles.map((t) => (
              <option key={t} value={t}>
                {t}
              </option>
            ))}
          </select>
        </label>
        <label className="flex flex-col gap-1">
          <span className="text-xs text-[#606060]">Marca</span>
          <select className={inputStyleSm + " w-full"} value={filterMarca} onChange={(e) => setFilterMarca(e.target.value)}>
            <option value="">Todas</option>
            {marcasDisponibles.map((m) => (
              <option key={m} value={m}>
                {m}
              </option>
            ))}
          </select>
        </label>
        <label className="flex flex-col gap-1">
          <span className="text-xs text-[#606060]">Año</span>
          <select className={inputStyleSm + " w-full"} value={filterYear} onChange={(e) => setFilterYear(e.target.value)}>
            <option value="">Todos</option>
            {aniosDisponibles.map((y) => (
              <option key={y} value={y}>
                {y}
              </option>
            ))}
          </select>
        </label>
      </div>

      {hasActiveFilters && (
        <button
          onClick={clearFilters}
          className="mt-2 flex items-center gap-1 text-xs text-[#606060] hover:text-[#e83038]"
        >
          <X size={12} /> Limpiar filtros
        </button>
      )}

      <div className="my-4 border-t border-[#e2e0dc]" />

      <p className="text-sm text-[#282828]">{db.length} presupuestos</p>
      <p className="text-sm text-[#282828]">{linesCount} líneas de producto</p>
      <div className="mt-2 flex items-center gap-2 text-sm">
        <span className={`inline-block h-2 w-2 rounded-full ${dbError ? "bg-[#e83038]" : "bg-emerald-500"}`} aria-hidden />
        <span className={dbError ? "text-[#e83038]" : "text-[#606060]"}>
          {dbError ? `Sin conexión: ${dbError}` : "Conectado"}
        </span>
      </div>
      <Button variant="ghost-light" className="mt-3 w-full justify-center" onClick={handleRefresh} disabled={refreshing}>
        {refreshing && <Loader2 size={14} className="animate-spin" />}
        Actualizar ahora
      </Button>

      <div className="my-4 border-t border-[#e2e0dc]" />

      <p className="mb-2 text-xs font-semibold tracking-wide text-[#606060]">BACKUP</p>
      <div className="flex flex-col gap-2">
        <Button variant="ghost-light" className="w-full justify-center" onClick={handlePrepareBackup} disabled={db.length === 0}>
          Preparar backup
        </Button>
        <input
          ref={fileInputRef}
          type="file"
          accept="application/json"
          className="hidden"
          onChange={(e) => {
            const file = e.target.files?.[0];
            if (file) handleImportFile(file);
            e.target.value = "";
          }}
        />
        <Button variant="ghost-light" className="w-full justify-center" onClick={() => fileInputRef.current?.click()} disabled={importing}>
          {importing && <Loader2 size={14} className="animate-spin" />}
          Importar backup
        </Button>
      </div>
      <p className="mt-2 text-xs text-[#606060]">
        Haz un backup de vez en cuando, por si acaso — no sustituye a tener copia del PDF original.
      </p>
    </aside>
  );
}
