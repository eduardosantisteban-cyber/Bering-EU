// Importa el backup JSON exportado desde la versión antigua (artefacto de
// Claude.ai) a la base de datos Supabase nueva.
//
// Uso:
//   SUPABASE_URL=... SUPABASE_SERVICE_ROLE_KEY=... node scripts/seed.mjs ruta/al/backup.json
//
// Detecta y omite presupuestos duplicados (mismo conjunto de ids de líneas).

import { readFile } from "node:fs/promises";
import { createClient } from "@supabase/supabase-js";

const [, , backupPath] = process.argv;
if (!backupPath) {
  console.error("Uso: node scripts/seed.mjs ruta/al/backup.json");
  process.exit(1);
}

const url = process.env.SUPABASE_URL;
const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!url || !key) {
  console.error("Faltan SUPABASE_URL o SUPABASE_SERVICE_ROLE_KEY en el entorno.");
  process.exit(1);
}

const db = createClient(url, key, { auth: { autoRefreshToken: false, persistSession: false } });

const raw = JSON.parse(await readFile(backupPath, "utf-8"));
const presupuestos = raw.presupuestos ?? raw;
if (!Array.isArray(presupuestos)) {
  console.error("El backup no tiene el formato esperado ({ presupuestos: [...] }).");
  process.exit(1);
}

const seen = new Set();
let imported = 0;
let skippedDuplicates = 0;

for (const p of presupuestos) {
  const items = Array.isArray(p.items) ? p.items : [];
  const dedupeKey = items.map((it) => it.id).sort().join(",");
  if (dedupeKey && seen.has(dedupeKey)) {
    skippedDuplicates++;
    console.log(`Omitido (duplicado): ${p.proveedor} · ${p.numero_presupuesto}`);
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
    pdf_storage_path: null,
    uploaded_at: p.uploaded_at ?? new Date().toISOString(),
  });
  if (presError) {
    console.error(`Error al importar ${p.id}:`, presError.message);
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
      console.error(`Error al importar líneas de ${p.id}:`, itemsError.message);
      continue;
    }
  }

  imported++;
  console.log(`Importado: ${p.proveedor} · ${p.numero_presupuesto} (${items.length} líneas)`);
}

console.log(`\nListo. ${imported} presupuestos importados, ${skippedDuplicates} duplicados omitidos.`);
