import { supabaseAdmin } from "./supabase/server";
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
