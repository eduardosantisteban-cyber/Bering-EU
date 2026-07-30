"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Image from "next/image";
import { ArrowUpDown, Loader2, LogOut, Package, Scale, Search, ShoppingCart, Upload, X } from "lucide-react";
import type { Presupuesto } from "@/lib/types";
import { APP_VERSION, CATEGORIAS } from "@/lib/constants";
import { fetchPresupuestos, logout } from "@/lib/apiClient";
import { fmtMoney, normalizeMarca, normalizeStr } from "@/lib/format";
import { Button, Notice, inputStyleSm } from "./components/ui";
import type { FlatRow } from "./components/types";
import UploadModal from "./components/UploadModal";
import DetailModal from "./components/DetailModal";
import ComparadorModal from "./components/ComparadorModal";
import CotizadorPanel, { type CartLine } from "./components/CotizadorPanel";
import ChangelogModal from "./components/ChangelogModal";

type SortKey = "fecha_presupuesto" | "precio_unitario" | "tipo_producto" | "marca";

export default function HomePage() {
  const [db, setDb] = useState<Presupuesto[]>([]);
  const [loading, setLoading] = useState(true);
  const [notice, setNotice] = useState<{ type: "error" | "success"; message: string } | null>(null);
  const noticeTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const [search, setSearch] = useState("");
  const [filterCategoria, setFilterCategoria] = useState("");
  const [filterTipo, setFilterTipo] = useState("");
  const [filterMarca, setFilterMarca] = useState("");
  const [filterYear, setFilterYear] = useState("");
  const [sortBy, setSortBy] = useState<{ key: SortKey; dir: "asc" | "desc" }>({
    key: "fecha_presupuesto",
    dir: "desc",
  });

  const [uploadOpen, setUploadOpen] = useState(false);
  const [detailRecordId, setDetailRecordId] = useState<string | null>(null);
  const [comparadorOpen, setComparadorOpen] = useState(false);
  const [cartOpen, setCartOpen] = useState(false);
  const [changelogOpen, setChangelogOpen] = useState(false);
  const [cart, setCart] = useState<CartLine[]>([]);

  const showNotice = useCallback((type: "error" | "success", message: string) => {
    setNotice({ type, message });
    if (noticeTimer.current) clearTimeout(noticeTimer.current);
    noticeTimer.current = setTimeout(() => setNotice(null), type === "error" ? 8000 : 4000);
  }, []);

  const refresh = useCallback(async () => {
    try {
      const data = await fetchPresupuestos();
      setDb(data);
    } catch (err) {
      showNotice("error", (err as Error).message || "No se pudo cargar la base de datos");
    } finally {
      setLoading(false);
    }
  }, [showNotice]);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- carga inicial de datos
    refresh();
  }, [refresh]);

  const rows: FlatRow[] = useMemo(() => {
    const out: FlatRow[] = [];
    for (const rec of db) {
      for (const it of rec.items ?? []) {
        out.push({ ...it, __rec: rec });
      }
    }
    return out;
  }, [db]);

  const tiposDisponibles = useMemo(
    () => Array.from(new Set(rows.map((r) => r.tipo_producto).filter(Boolean))).sort() as string[],
    [rows]
  );
  const marcasDisponibles = useMemo(() => {
    // Agrupa variantes de la misma marca (p. ej. "NOVOFERM ALSAL, SA" y
    // "NOVOFERM ALSAL, S.A.") bajo una sola entrada del filtro, sin tocar
    // el texto tal como está guardado en cada línea.
    const map = new Map<string, string>(); // clave normalizada -> primera variante vista
    for (const r of rows) {
      if (!r.marca) continue;
      const key = normalizeMarca(r.marca);
      if (!key || map.has(key)) continue;
      map.set(key, r.marca);
    }
    return Array.from(map.values()).sort();
  }, [rows]);
  const aniosDisponibles = useMemo(
    () =>
      Array.from(
        new Set(
          rows
            .map((r) => r.__rec.fecha_presupuesto)
            .filter(Boolean)
            .map((f) => String(f).slice(0, 4))
        )
      ).sort((a, b) => b.localeCompare(a)),
    [rows]
  );

  const filteredRows = useMemo(() => {
    let out = rows;
    if (filterCategoria) out = out.filter((r) => normalizeStr(r.categoria) === normalizeStr(filterCategoria));
    if (filterTipo) out = out.filter((r) => r.tipo_producto === filterTipo);
    if (filterMarca) out = out.filter((r) => normalizeMarca(r.marca) === normalizeMarca(filterMarca));
    if (filterYear) out = out.filter((r) => r.__rec.fecha_presupuesto?.startsWith(filterYear));
    if (search.trim()) {
      const q = search.trim().toLowerCase();
      out = out.filter((r) =>
        [r.tipo_producto, r.marca, r.modelo, r.medidas, r.__rec.proveedor, r.__rec.numero_presupuesto]
          .filter(Boolean)
          .some((v) => String(v).toLowerCase().includes(q))
      );
    }
    out = [...out].sort((a, b) => {
      let av: string | number, bv: string | number;
      if (sortBy.key === "fecha_presupuesto") {
        av = a.__rec.fecha_presupuesto || "";
        bv = b.__rec.fecha_presupuesto || "";
      } else if (sortBy.key === "precio_unitario") {
        av = a.precio_unitario ?? -Infinity;
        bv = b.precio_unitario ?? -Infinity;
      } else {
        av = (a[sortBy.key] as string) || "";
        bv = (b[sortBy.key] as string) || "";
      }
      if (av < bv) return sortBy.dir === "asc" ? -1 : 1;
      if (av > bv) return sortBy.dir === "asc" ? 1 : -1;
      return 0;
    });
    return out;
  }, [rows, filterCategoria, filterTipo, filterMarca, filterYear, search, sortBy]);

  function toggleSort(key: SortKey) {
    setSortBy((s) => (s.key === key ? { key, dir: s.dir === "asc" ? "desc" : "asc" } : { key, dir: "asc" }));
  }

  function inCart(itemId: string) {
    return cart.some((c) => c.itemId === itemId);
  }
  function toggleCart(itemId: string) {
    setCart((c) =>
      c.some((x) => x.itemId === itemId)
        ? c.filter((x) => x.itemId !== itemId)
        : [...c, { itemId, cantidad: 1, markup: 0 }]
    );
  }

  const detailRecord = db.find((r) => r.id === detailRecordId) ?? null;

  async function handleLogout() {
    await logout();
    window.location.href = "/login";
  }

  return (
    <div className="flex min-h-screen flex-col">
      <header className="sticky top-0 z-30 flex items-center justify-between bg-black px-5 py-3">
        <div className="flex items-center gap-3">
          <Image src="/logo.jpg" alt="Bering EU" width={94} height={28} priority />
          <div>
            <h1 className="text-lg font-semibold text-white">
              Presupuestos{" "}
              <button
                onClick={() => setChangelogOpen(true)}
                className="align-middle text-xs font-normal text-white/60 hover:text-[#e83038] hover:underline"
              >
                v{APP_VERSION}
              </button>
            </h1>
            <p className="text-xs text-white/60">{db.length} presupuestos · {rows.length} líneas</p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="ghost-light" onClick={() => setComparadorOpen(true)}>
            <Scale size={15} /> Comparador
          </Button>
          <Button variant="ghost-light" onClick={() => setCartOpen(true)}>
            <ShoppingCart size={15} /> Cotizador {cart.length > 0 && `(${cart.length})`}
          </Button>
          <Button variant="primary" onClick={() => setUploadOpen(true)}>
            <Upload size={15} /> Subir PDF
          </Button>
          <button onClick={handleLogout} className="rounded p-2 text-white/70 hover:bg-white/10 hover:text-white" aria-label="Salir">
            <LogOut size={16} />
          </button>
        </div>
      </header>

      <main className="flex-1 p-5">
        <div className="mb-4 flex flex-wrap items-center gap-2">
          <div className="relative flex-1 min-w-[200px]">
            <Search size={14} className="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 text-[#606060]" />
            <input
              className={inputStyleSm + " w-full pl-8"}
              placeholder="Buscar por tipo, marca, modelo, medidas, proveedor…"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </div>
          <select className={inputStyleSm} value={filterCategoria} onChange={(e) => setFilterCategoria(e.target.value)}>
            <option value="">Todas las categorías</option>
            {CATEGORIAS.map((c) => (
              <option key={c} value={c}>
                {c}
              </option>
            ))}
          </select>
          <select className={inputStyleSm} value={filterTipo} onChange={(e) => setFilterTipo(e.target.value)}>
            <option value="">Todos los tipos</option>
            {tiposDisponibles.map((t) => (
              <option key={t} value={t}>
                {t}
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
          <select className={inputStyleSm} value={filterYear} onChange={(e) => setFilterYear(e.target.value)}>
            <option value="">Todos los años</option>
            {aniosDisponibles.map((y) => (
              <option key={y} value={y}>
                {y}
              </option>
            ))}
          </select>
          {(filterCategoria || filterTipo || filterMarca || filterYear || search) && (
            <button
              onClick={() => {
                setFilterCategoria("");
                setFilterTipo("");
                setFilterMarca("");
                setFilterYear("");
                setSearch("");
              }}
              className="flex items-center gap-1 text-xs text-[#606060] hover:text-[#e83038]"
            >
              <X size={12} /> Limpiar filtros
            </button>
          )}
        </div>

        {loading ? (
          <div className="flex items-center justify-center gap-2 py-20 text-[#606060]">
            <Loader2 size={18} className="animate-spin" /> Cargando…
          </div>
        ) : filteredRows.length === 0 ? (
          <div className="flex flex-col items-center gap-2 py-20 text-[#606060]">
            <Package size={28} />
            <p className="text-sm">
              {db.length === 0 ? "Aún no hay presupuestos. Sube el primer PDF." : "No hay líneas que coincidan con los filtros."}
            </p>
          </div>
        ) : (
          <div className="overflow-x-auto rounded-lg border border-[#e2e0dc] bg-white">
            <table className="w-full text-sm">
              <thead className="bg-[#f5f4f2] text-left text-xs text-[#606060]">
                <tr>
                  <SortableTh label="Categoría" />
                  <SortableTh label="Tipo" sortKey="tipo_producto" sortBy={sortBy} onSort={toggleSort} />
                  <SortableTh label="Marca" sortKey="marca" sortBy={sortBy} onSort={toggleSort} />
                  <th className="px-3 py-2">Modelo</th>
                  <th className="px-3 py-2">Medidas</th>
                  <SortableTh label="Precio" sortKey="precio_unitario" sortBy={sortBy} onSort={toggleSort} align="right" />
                  <th className="px-3 py-2 text-right">Cant.</th>
                  <SortableTh label="Fecha" sortKey="fecha_presupuesto" sortBy={sortBy} onSort={toggleSort} />
                  <th className="px-3 py-2"></th>
                </tr>
              </thead>
              <tbody>
                {filteredRows.map((r) => (
                  <tr
                    key={r.id}
                    className="cursor-pointer border-t border-[#e2e0dc] hover:bg-[#f5f4f2]"
                    onClick={() => setDetailRecordId(r.__rec.id)}
                  >
                    <td className="px-3 py-2">{r.categoria}</td>
                    <td className="px-3 py-2">{r.tipo_producto}</td>
                    <td className="px-3 py-2">{r.marca}</td>
                    <td className="px-3 py-2">{r.modelo}</td>
                    <td className="px-3 py-2">{r.medidas}</td>
                    <td className="px-3 py-2 text-right font-medium">{fmtMoney(r.precio_unitario)}</td>
                    <td className="px-3 py-2 text-right">{r.cantidad}</td>
                    <td className="px-3 py-2">
                      {r.__rec.fecha_presupuesto
                        ? new Date(r.__rec.fecha_presupuesto).toLocaleDateString("es-ES")
                        : "—"}
                    </td>
                    <td className="px-3 py-2 text-right">
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          toggleCart(r.id);
                        }}
                        className={`rounded p-1.5 ${inCart(r.id) ? "bg-[#e83038] text-white" : "text-[#606060] hover:bg-white"}`}
                        aria-label="Añadir al cotizador"
                      >
                        <ShoppingCart size={14} />
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </main>

      {uploadOpen && (
        <UploadModal
          onClose={() => setUploadOpen(false)}
          onSaved={(proveedor) => {
            refresh();
            showNotice("success", `Presupuesto de ${proveedor} guardado correctamente.`);
          }}
          onError={(message) => showNotice("error", message)}
        />
      )}

      {detailRecord && (
        <DetailModal
          presupuesto={detailRecord}
          onClose={() => setDetailRecordId(null)}
          onUpdated={(saved) => {
            setDb((prev) => prev.map((p) => (p.id === saved.id ? saved : p)));
            showNotice("success", "Cambios guardados.");
          }}
          onDeleted={(id) => {
            setDb((prev) => prev.filter((p) => p.id !== id));
            setDetailRecordId(null);
            showNotice("success", "Presupuesto eliminado.");
          }}
          onError={(message) => showNotice("error", message)}
        />
      )}

      {comparadorOpen && <ComparadorModal rows={rows} onClose={() => setComparadorOpen(false)} />}

      {cartOpen && (
        <CotizadorPanel rows={rows} cart={cart} setCart={setCart} onClose={() => setCartOpen(false)} />
      )}

      {changelogOpen && <ChangelogModal onClose={() => setChangelogOpen(false)} />}

      {notice && <Notice type={notice.type} message={notice.message} />}
    </div>
  );
}

function SortableTh({
  label,
  sortKey,
  sortBy,
  onSort,
  align,
}: {
  label: string;
  sortKey?: SortKey;
  sortBy?: { key: SortKey; dir: "asc" | "desc" };
  onSort?: (key: SortKey) => void;
  align?: "right";
}) {
  if (!sortKey || !onSort) {
    return <th className={`px-3 py-2 ${align === "right" ? "text-right" : ""}`}>{label}</th>;
  }
  const active = sortBy?.key === sortKey;
  return (
    <th className={`px-3 py-2 ${align === "right" ? "text-right" : ""}`}>
      <button
        onClick={() => onSort(sortKey)}
        className={`inline-flex items-center gap-1 ${active ? "text-[#e83038]" : ""}`}
      >
        {label}
        <ArrowUpDown size={11} />
      </button>
    </th>
  );
}
