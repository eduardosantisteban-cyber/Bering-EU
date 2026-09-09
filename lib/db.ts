import { supabaseAdmin } from "./supabase/server";
import { itemsDedupeKey } from "./backup";
import type { Presupuesto, PresupuestoItem } from "./types";

type PresupuestoRow = Omit<Presupuesto, "items">;

export async function listPresupuestos(): Promise<Presupuesto[]> {
  const db = supabaseAdmin();
  const { data: presupuestos, error } = await db
    .from("presupuestos")
    .select("*")
    .order("fecha_presupuesto", { ascending: false, nullsFirst: false });
  if (error) throw error;

  const { data: items, error: itemsError } = await db
    .from("presupuesto_items")
    .select("*");
  if (itemsError) throw itemsError;

  const itemsByPresupuesto = new Map<string, PresupuestoItem[]>();
  for (const item of items ?? []) {
    const list = itemsByPresupuesto.get(item.presupuesto_id) ?? [];
    list.push(item as PresupuestoItem);
    itemsByPresupuesto.set(item.presupuesto_id, list);
  }

  return (presupuestos as PresupuestoRow[]).map((p) => ({
    ...p,
    items: itemsByPresupuesto.get(p.id) ?? [],
  }));
}

export async function getPresupuesto(id: string): Promise<Presupuesto | null> {
  const db = supabaseAdmin();
  const { data: presupuesto, error } = await db
    .from("presupuestos")
    .select("*")
    .eq("id", id)
    .maybeSingle();
  if (error) throw error;
  if (!presupuesto) return null;

  const { data: items, error: itemsError } = await db
    .from("presupuesto_items")
    .select("*")
    .eq("presupuesto_id", id)
    .order("grupo", { ascending: true });
  if (itemsError) throw itemsError;

  return { ...(presupuesto as PresupuestoRow), items: (items ?? []) as PresupuestoItem[] };
}

export async function createPresupuesto(
  presupuesto: Omit<PresupuestoRow, "created_at" | "updated_at" | "uploaded_at"> & {
    uploaded_at?: string;
  },
  items: Omit<PresupuestoItem, "presupuesto_id">[]
): Promise<Presupuesto> {
  const db = supabaseAdmin();
  const { error } = await db.from("presupuestos").insert({
    ...presupuesto,
    uploaded_at: presupuesto.uploaded_at ?? new Date().toISOString(),
  });
  if (error) throw error;

  if (items.length > 0) {
    const { error: itemsError } = await db.from("presupuesto_items").insert(
      items.map((it) => ({ ...it, presupuesto_id: presupuesto.id }))
    );
    if (itemsError) throw itemsError;
  }

  const saved = await getPresupuesto(presupuesto.id);
  if (!saved) throw new Error("No se pudo leer el presupuesto recién creado");
  return saved;
}

export async function updatePresupuesto(
  id: string,
  patch: Partial<Pick<PresupuestoRow, "proveedor" | "numero_presupuesto" | "fecha_presupuesto" | "drive_url">>,
  items?: Omit<PresupuestoItem, "presupuesto_id">[]
): Promise<Presupuesto> {
  const db = supabaseAdmin();

  if (Object.keys(patch).length > 0) {
    const { error } = await db.from("presupuestos").update(patch).eq("id", id);
    if (error) throw error;
  }

  if (items) {
    const { error: deleteError } = await db
      .from("presupuesto_items")
      .delete()
      .eq("presupuesto_id", id);
    if (deleteError) throw deleteError;

    if (items.length > 0) {
      const { error: insertError } = await db.from("presupuesto_items").insert(
        items.map((it) => ({ ...it, presupuesto_id: id }))
      );
      if (insertError) throw insertError;
    }
  }

  const saved = await getPresupuesto(id);
  if (!saved) throw new Error("Presupuesto no encontrado tras actualizar");
  return saved;
}

export async function deletePresupuesto(id: string): Promise<void> {
  const db = supabaseAdmin();
  const { error } = await db.from("presupuestos").delete().eq("id", id);
  if (error) throw error;
}

/**
 * Restaura presupuestos desde un backup exportado (misma lógica que
 * scripts/seed.mjs): upsert por id (idempotente, seguro re-importar el
 * mismo backup varias veces) y omite entradas cuyo conjunto de líneas ya
 * apareció antes en el mismo archivo.
 */
export async function importPresupuestos(
  records: unknown[]
): Promise<{ imported: number; skipped: number; errors: string[] }> {
  const db = supabaseAdmin();
  const seen = new Set<string>();
  let imported = 0;
  let skipped = 0;
  const errors: string[] = [];

  for (const raw of records) {
    const p = raw as Partial<PresupuestoRow> & { items?: PresupuestoItem[] };
    if (!p || typeof p !== "object" || !p.id) {
      skipped++;
      continue;
    }
    const items = Array.isArray(p.items) ? p.items : [];
    const dedupeKey = itemsDedupeKey(items);
    if (dedupeKey && seen.has(dedupeKey)) {
      skipped++;
      continue;
    }
    if (dedupeKey) seen.add(dedupeKey);

    const { error: presError } = await db.from("presupuestos").upsert({
      id: p.id,
      proveedor: p.proveedor || "",
      numero_presupuesto: p.numero_presupuesto ?? null,
      fecha_presupuesto: p.fecha_presupuesto ?? null,
      pdf_filename: p.pdf_filename ?? null,
      drive_url: p.drive_url ?? null,
      pdf_storage_path: p.pdf_storage_path ?? null,
      uploaded_at: p.uploaded_at ?? new Date().toISOString(),
    });
    if (presError) {
      errors.push(`${p.proveedor ?? p.id}: ${presError.message}`);
      continue;
    }

    if (items.length > 0) {
      const { error: itemsError } = await db.from("presupuesto_items").upsert(
        items.map((it) => ({
          id: it.id,
          presupuesto_id: p.id,
          codigo_articulo: it.codigo_articulo ?? null,
          categoria: it.categoria || "",
          tipo_producto: it.tipo_producto ?? null,
          marca: it.marca ?? null,
          modelo: it.modelo ?? null,
          medidas: it.medidas ?? null,
          precio_unitario: it.precio_unitario ?? null,
          moneda: it.moneda || "EUR",
          cantidad: it.cantidad ?? 1,
          es_accesorio: !!it.es_accesorio,
          grupo: it.grupo ?? 1,
          notas: it.notas ?? null,
        }))
      );
      if (itemsError) {
        errors.push(`Líneas de ${p.proveedor ?? p.id}: ${itemsError.message}`);
        continue;
      }
    }

    imported++;
  }

  return { imported, skipped, errors };
}
