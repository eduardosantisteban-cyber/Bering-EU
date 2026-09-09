"use client";

import { useRef, useState } from "react";
import { Loader2 } from "lucide-react";
import { APP_VERSION, CHANGELOG } from "@/lib/constants";
import { importBackup } from "@/lib/apiClient";
import { backupFilename, buildBackupPayload, extractBackupList } from "@/lib/backup";
import type { Presupuesto } from "@/lib/types";
import { Button, ModalHeader, Overlay } from "./ui";

export default function ChangelogModal({
  onClose,
  db,
  linesCount,
  dbError,
  onRefresh,
  onNotice,
}: {
  onClose: () => void;
  db: Presupuesto[];
  linesCount: number;
  dbError: string | null;
  onRefresh: () => Promise<void>;
  onNotice: (type: "error" | "success", message: string) => void;
}) {
  const [refreshing, setRefreshing] = useState(false);
  const [importing, setImporting] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

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
    <Overlay onClose={onClose}>
      <div className="flex max-h-[85vh] w-[min(560px,92vw)] flex-col rounded-xl bg-white">
        <ModalHeader title="Estado y backup" subtitle={`Versión actual: v${APP_VERSION}`} onClose={onClose} />
        <div className="flex-1 overflow-y-auto p-5">
          <p className="text-sm text-[#282828]">{db.length} presupuestos</p>
          <p className="text-sm text-[#282828]">{linesCount} líneas de producto</p>

          <div className="mt-3 flex items-center gap-2 text-sm">
            <span
              className={`inline-block h-2 w-2 rounded-full ${dbError ? "bg-[#e83038]" : "bg-emerald-500"}`}
              aria-hidden
            />
            <span className={dbError ? "text-[#e83038]" : "text-[#606060]"}>
              {dbError ? `Sin conexión: ${dbError}` : "Conectado"}
            </span>
          </div>

          <Button
            variant="ghost-light"
            className="mt-3 w-full justify-center"
            onClick={handleRefresh}
            disabled={refreshing}
          >
            {refreshing && <Loader2 size={14} className="animate-spin" />}
            Actualizar ahora
          </Button>

          <div className="my-5 border-t border-[#e2e0dc]" />

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
            <Button
              variant="ghost-light"
              className="w-full justify-center"
              onClick={() => fileInputRef.current?.click()}
              disabled={importing}
            >
              {importing && <Loader2 size={14} className="animate-spin" />}
              Importar backup
            </Button>
          </div>
          <p className="mt-2 text-xs text-[#606060]">
            Haz un backup de vez en cuando, por si acaso — no sustituye a tener copia del PDF original.
          </p>

          <div className="my-5 border-t border-[#e2e0dc]" />

          <p className="mb-2 text-xs font-semibold tracking-wide text-[#606060]">HISTORIAL DE VERSIONES</p>
          <ul className="flex flex-col gap-4">
            {CHANGELOG.map((entry) => (
              <li key={entry.version} className="border-l-2 border-[#e2e0dc] pl-3">
                <span className="text-sm font-semibold text-[#282828]">v{entry.version}</span>
                <p className="text-sm text-[#606060]">{entry.desc}</p>
              </li>
            ))}
          </ul>
        </div>
      </div>
    </Overlay>
  );
}
