// Finanzas de gestión (agente CFO): tipos y cálculos compartidos por la API y la página /finanzas.
// Todo en base imponible (sin IVA) y en EUR. Bering LU (holding) va aparte: no entra en la cuenta de Bering ES.

export type TipoDoc = "venta" | "cogs" | "fijo" | "variable" | "personal" | "grupo";

export interface DocFin {
  id: string;
  sociedad: string;
  tipo: TipoDoc;
  categoria: string | null;
  contraparte: string;
  numero: string;
  fecha: string;
  mes: string;
  base: number | null;
  iva: number | null;
  total: number | null;
  moneda: string;
  isp: boolean;
  ticket: boolean;
  beuq: string | null;
  hito: string | null;
  vencimiento: string | null;
  pagado: boolean | null;
  /** Eduardo confirmó a mano que está cobrado/pagado aunque Holded diga pendiente */
  pago_confirmado_manual?: boolean;
  drive_id: string | null;
  notas: string | null;
}

export interface IncidenciaFin {
  id: string;
  creado: string;
  mes: string;
  tipo: "faltante" | "duplicado" | "sin_emparejar" | "cogs_pendiente" | "otra_sociedad" | "ilegible" | "otro";
  descripcion: string;
  beuq: string | null;
  importe: number | null;
  drive_id: string | null;
  resuelto: boolean;
  /** Clave estable (p. ej. «anulada:F262016», «no-facturar:BEUQ421») */
  clave?: string | null;
  /** Respuesta de Eduardo desde el panel; el agente CFO la aplica en la siguiente revisión */
  respuesta?: string | null;
  respondido_en?: string | null;
}

export const SOCIEDAD_PRINCIPAL = "Bering ES";

/**
 * Importe que cuenta: base imponible en EUR. Si el documento no desglosa el IVA (tickets de Uber, taxi…),
 * el IVA no es deducible y el gasto es el total. null si no es EUR o no consta ningún importe.
 */
export function importe(d: Pick<DocFin, "base" | "total" | "moneda">): number | null {
  if (d.moneda !== "EUR") return null;
  if (d.base !== null && d.base !== undefined) return Number(d.base);
  if (d.total !== null && d.total !== undefined) return Number(d.total);
  return null;
}

export interface FilaPyG {
  mes: string;
  ventas: number;
  cogs: number;
  margenBruto: number;
  fijos: number;
  variables: number;
  personal: number;
  /** null = no hay ningún dato de nóminas cargado para ese mes */
  personalCargado: boolean;
  resultado: number;
}

/** Cuenta de resultados de gestión por mes (Bering ES), en orden cronológico. */
export function pygMensual(docs: DocFin[]): FilaPyG[] {
  const meses = new Map<string, FilaPyG>();
  for (const d of docs) {
    if (d.sociedad !== SOCIEDAD_PRINCIPAL) continue;
    const v = importe(d);
    if (v === null) continue;
    let f = meses.get(d.mes);
    if (!f) {
      f = { mes: d.mes, ventas: 0, cogs: 0, margenBruto: 0, fijos: 0, variables: 0, personal: 0, personalCargado: false, resultado: 0 };
      meses.set(d.mes, f);
    }
    if (d.tipo === "venta") f.ventas += v;
    else if (d.tipo === "cogs") f.cogs += v;
    else if (d.tipo === "fijo") f.fijos += v;
    else if (d.tipo === "variable") f.variables += v;
    else if (d.tipo === "personal") {
      f.personal += v;
      f.personalCargado = true;
    }
  }
  const filas = [...meses.values()].sort((a, b) => a.mes.localeCompare(b.mes));
  for (const f of filas) {
    f.margenBruto = f.ventas - f.cogs;
    f.resultado = f.margenBruto - f.fijos - f.variables - f.personal;
  }
  return filas;
}

export interface Proyecto {
  beuq: string;
  cliente: string;
  ventas: number;
  cogs: number;
  margen: number;
  margenPct: number | null;
  estado: "completo" | "cogs_pendiente" | "revisar" | "sin_venta";
  ultimaFecha: string;
}

/** Margen real por proyecto (BEUQ): ventas frente a COGS imputados. */
export function proyectos(docs: DocFin[], incidencias: IncidenciaFin[]): Proyecto[] {
  const abiertas = incidencias.filter((i) => !i.resuelto && i.beuq);
  const pendientes = new Set(abiertas.filter((i) => i.tipo === "cogs_pendiente").map((i) => i.beuq as string));
  const revisar = new Set(abiertas.map((i) => i.beuq as string));
  const porBeuq = new Map<string, Proyecto>();
  for (const d of docs) {
    if (!d.beuq || d.sociedad !== SOCIEDAD_PRINCIPAL || (d.tipo !== "venta" && d.tipo !== "cogs")) continue;
    const v = importe(d) ?? 0;
    let p = porBeuq.get(d.beuq);
    if (!p) {
      p = { beuq: d.beuq, cliente: "", ventas: 0, cogs: 0, margen: 0, margenPct: null, estado: "completo", ultimaFecha: d.fecha };
      porBeuq.set(d.beuq, p);
    }
    if (d.tipo === "venta") {
      p.ventas += v;
      if (!p.cliente) p.cliente = d.contraparte;
    } else p.cogs += v;
    if (d.fecha > p.ultimaFecha) p.ultimaFecha = d.fecha;
  }
  for (const b of pendientes) {
    if (!porBeuq.has(b)) porBeuq.set(b, { beuq: b, cliente: "", ventas: 0, cogs: 0, margen: 0, margenPct: null, estado: "cogs_pendiente", ultimaFecha: "" });
  }
  const lista = [...porBeuq.values()];
  for (const p of lista) {
    p.margen = p.ventas - p.cogs;
    p.margenPct = p.ventas ? p.margen / p.ventas : null;
    p.estado = !p.ventas ? "sin_venta" : pendientes.has(p.beuq) || !p.cogs ? "cogs_pendiente" : revisar.has(p.beuq) ? "revisar" : "completo";
  }
  return lista.sort((a, b) => b.ultimaFecha.localeCompare(a.ultimaFecha));
}

/** Gastos (fijos + variables) agrupados por categoría en los meses indicados. */
export function gastosPorCategoria(docs: DocFin[], meses: Set<string>): { k: string; n: number }[] {
  const m = new Map<string, number>();
  for (const d of docs) {
    if (d.sociedad !== SOCIEDAD_PRINCIPAL || !meses.has(d.mes) || (d.tipo !== "fijo" && d.tipo !== "variable")) continue;
    const v = importe(d);
    if (v === null) continue;
    const k = d.categoria || "Otros";
    m.set(k, (m.get(k) || 0) + v);
  }
  return [...m.entries()].map(([k, n]) => ({ k, n })).sort((a, b) => b.n - a.n);
}

const MESES = ["ene", "feb", "mar", "abr", "may", "jun", "jul", "ago", "sep", "oct", "nov", "dic"];
/** "2026-10" → "oct 26" */
export function nombreMes(mes: string): string {
  const [a, m] = mes.split("-");
  return `${MESES[Number(m) - 1] || m} ${a.slice(2)}`;
}

export const enlaceDrive = (id: string | null) => (id ? `https://drive.google.com/file/d/${encodeURIComponent(id)}/view` : null);

// ── Caja: cobros y pagos pendientes ──

export interface Movimiento {
  doc: DocFin;
  /** Fecha que cuenta para la caja: el vencimiento o, si no consta, la fecha de la factura (pago al contado) */
  fechaCaja: string;
  /** Días desde el vencimiento (positivo = vencido) */
  diasVencido: number;
  /** pagado === false: el documento dice que está pendiente · null: sin comprobar */
  confirmadoPendiente: boolean;
}

const DIA = 86400000;

function movimiento(d: DocFin, hoy: Date): Movimiento {
  const fechaCaja = (d.vencimiento || d.fecha).slice(0, 10);
  const dias = Math.floor((hoy.getTime() - new Date(fechaCaja + "T00:00:00").getTime()) / DIA);
  return { doc: d, fechaCaja, diasVencido: dias, confirmadoPendiente: d.pagado === false };
}

/**
 * Cobros: facturas de venta de Bering ES no marcadas como cobradas.
 * Pagos: facturas de proveedor (COGS) no marcadas como pagadas, y gastos que el propio documento da por pendientes.
 * Importes con IVA (lo que entra o sale de la cuenta). Ordenados por fecha de caja.
 */
export function cobrosYPagos(docs: DocFin[], hoy: Date): { cobros: Movimiento[]; pagos: Movimiento[] } {
  const es = docs.filter((d) => d.sociedad === SOCIEDAD_PRINCIPAL && d.moneda === "EUR" && d.pagado !== true);
  const orden = (a: Movimiento, b: Movimiento) => a.fechaCaja.localeCompare(b.fechaCaja);
  return {
    cobros: es.filter((d) => d.tipo === "venta").map((d) => movimiento(d, hoy)).sort(orden),
    pagos: es
      .filter((d) => d.tipo === "cogs" || ((d.tipo === "fijo" || d.tipo === "variable") && d.pagado === false))
      .map((d) => movimiento(d, hoy))
      .sort(orden),
  };
}

/** Importe de caja de un documento: el total con IVA (o la base si no consta el total). */
export const importeCaja = (d: Pick<DocFin, "total" | "base">) => Number(d.total ?? d.base ?? 0);

// ── Ganado pendiente de facturar ──

/** "BEUQ401-B" → "BEUQ401" · "MMQ943" / "MM943-E" → "MM943" */
export function claveProyecto(codigo: string | null | undefined): string | null {
  const m = String(codigo || "").toUpperCase().match(/(BEUQ|MMQ|MM)\s*0*(\d+)/);
  if (!m) return null;
  return (m[1] === "BEUQ" ? "BEUQ" : "MM") + m[2];
}

export interface GanadoPendiente {
  clave: string;
  codigo: string;
  empresa: string;
  fechaGanado: string | null;
  importe: number;
  facturado: number;
  pendiente: number;
  /** true = el importe de la oportunidad viene del CRM de Holded, que lo guarda con IVA */
  conIva: boolean;
}

/**
 * Oportunidades ganadas (desde `desde`) cuyo importe ofertado aún no está facturado del todo.
 * `ops` viene de /api/portal (hoja Solicitudes + histórico de Holded).
 * Las de la hoja traen la base imponible; las del CRM de Holded (fila 0, sin enlace a la hoja) traen el total con IVA,
 * así que se comparan con lo facturado con IVA.
 * `excluir`: proyectos que no se facturarán (incidencias «no-facturar:BEUQxxx»).
 */
export function ganadoSinFacturar(
  ops: { codigo: string; empresa: string; estado: string; fechaEstado: string | null; importe: number | null; fila?: number; sheetUrl?: string }[],
  docs: DocFin[],
  desde = "2026-01-01",
  excluir: Set<string> = new Set(),
): GanadoPendiente[] {
  const facturado = new Map<string, number>();
  const facturadoIva = new Map<string, number>();
  for (const d of docs) {
    if (d.tipo !== "venta" || d.sociedad !== SOCIEDAD_PRINCIPAL || d.moneda !== "EUR") continue;
    const k = claveProyecto(d.beuq);
    const v = importe(d);
    if (k && v !== null) facturado.set(k, (facturado.get(k) || 0) + v);
    if (k) facturadoIva.set(k, (facturadoIva.get(k) || 0) + importeCaja(d));
  }
  const vistos = new Set<string>();
  const out: GanadoPendiente[] = [];
  for (const o of ops) {
    if (o.estado !== "Ganado" || !o.importe || o.importe <= 0) continue;
    if (o.fechaEstado && o.fechaEstado.slice(0, 10) < desde) continue;
    const k = claveProyecto(o.codigo);
    if (!k || vistos.has(k) || excluir.has(k)) continue;
    vistos.add(k);
    const conIva = o.fila === 0 && !o.sheetUrl;
    const f = (conIva ? facturadoIva : facturado).get(k) || 0;
    const pendiente = o.importe - f;
    // margen de redondeo: 1 % o 20 €
    if (pendiente <= Math.max(20, o.importe * 0.01)) continue;
    out.push({ clave: k, codigo: o.codigo, empresa: o.empresa, fechaGanado: o.fechaEstado, importe: o.importe, facturado: f, pendiente, conIva });
  }
  return out.sort((a, b) => b.pendiente - a.pendiente);
}

// ── Previsión de tesorería ──

export interface SemanaCaja {
  /** Lunes de la semana (ISO) */
  inicio: string;
  cobros: number;
  pagos: number;
  /** Nóminas y gastos fijos recurrentes que aún no tienen factura */
  recurrentes: number;
  saldoFinal: number;
  detalle: { texto: string; importe: number; clase: "cobro" | "pago" | "recurrente"; vencido?: boolean }[];
}

const iso = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
const lunes = (d: Date) => {
  const x = new Date(d.getFullYear(), d.getMonth(), d.getDate());
  x.setDate(x.getDate() - ((x.getDay() + 6) % 7));
  return x;
};
const mesAnterior = (mes: string, n: number) => {
  const [a, m] = mes.split("-").map(Number);
  const d = new Date(a, m - 1 - n, 1);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
};

/**
 * Gastos que se repiten cada mes y todavía no tienen factura en los meses que vienen:
 *  · Personal: el coste de nómina del último mes cargado, el último día de cada mes.
 *  · Fijos: proveedores con factura en al menos 2 de los 3 meses anteriores al actual; se repite el último
 *    importe (con IVA) el mismo día del mes.
 * Solo se proyecta si ese mes aún no tiene el documento.
 */
export function recurrentesFuturos(docs: DocFin[], hoy: Date, hasta: Date): { fecha: string; texto: string; importe: number }[] {
  const es = docs.filter((d) => d.sociedad === SOCIEDAD_PRINCIPAL && d.moneda === "EUR");
  const mesHoy = iso(hoy).slice(0, 7);
  const previos = new Set([1, 2, 3].map((n) => mesAnterior(mesHoy, n)));
  const out: { fecha: string; texto: string; importe: number }[] = [];
  const meses: string[] = [];
  for (let k = 0; k < 6; k++) {
    const d = new Date(hoy.getFullYear(), hoy.getMonth() + k, 1);
    if (d > hasta) break;
    meses.push(iso(d).slice(0, 7));
  }

  // Personal (coste empresa: bruto + Seguridad Social)
  const personal = es.filter((d) => d.tipo === "personal").sort((a, b) => b.mes.localeCompare(a.mes));
  if (personal.length) {
    const ultimoMes = personal[0].mes;
    const importeMes = personal.filter((d) => d.mes === ultimoMes).reduce((t, d) => t + importeCaja(d), 0);
    const cargados = new Set(personal.map((d) => d.mes));
    for (const m of meses) {
      if (cargados.has(m)) continue;
      const [a, mm] = m.split("-").map(Number);
      const f = iso(new Date(a, mm, 0));
      if (f >= iso(hoy) && f <= iso(hasta)) out.push({ fecha: f, texto: "Nóminas y Seguridad Social (estimado)", importe: importeMes });
    }
  }

  // Fijos recurrentes por proveedor
  const porProveedor = new Map<string, DocFin[]>();
  for (const d of es) {
    if (d.tipo !== "fijo") continue;
    const k = d.contraparte.trim().toLowerCase();
    if (!porProveedor.has(k)) porProveedor.set(k, []);
    porProveedor.get(k)!.push(d);
  }
  for (const lista of porProveedor.values()) {
    const mesesCon = new Set(lista.map((d) => d.mes));
    if ([...previos].filter((m) => mesesCon.has(m)).length < 2) continue;
    const ultimo = [...lista].sort((a, b) => b.fecha.localeCompare(a.fecha))[0];
    const dia = Number(ultimo.fecha.slice(8, 10)) || 1;
    for (const m of meses) {
      if (mesesCon.has(m)) continue;
      const [a, mm] = m.split("-").map(Number);
      const f = iso(new Date(a, mm - 1, Math.min(dia, new Date(a, mm, 0).getDate())));
      if (f >= iso(hoy) && f <= iso(hasta)) out.push({ fecha: f, texto: `${ultimo.contraparte} (cuota mensual estimada)`, importe: importeCaja(ultimo) });
    }
  }
  return out.sort((a, b) => a.fecha.localeCompare(b.fecha));
}

/**
 * Previsión semanal de caja: saldo inicial (bancos en Holded) + cobros − pagos pendientes − recurrentes.
 * Lo vencido y no cobrado/pagado se pone en la primera semana (marcado como vencido).
 */
export function previsionCaja(docs: DocFin[], saldoInicial: number, hoy: Date, semanas = 13): SemanaCaja[] {
  const { cobros, pagos } = cobrosYPagos(docs, hoy);
  const l0 = lunes(hoy);
  const fin = new Date(l0);
  fin.setDate(fin.getDate() + 7 * semanas - 1);
  const filas: SemanaCaja[] = [];
  for (let k = 0; k < semanas; k++) {
    const d = new Date(l0);
    d.setDate(d.getDate() + 7 * k);
    filas.push({ inicio: iso(d), cobros: 0, pagos: 0, recurrentes: 0, saldoFinal: 0, detalle: [] });
  }
  const semanaDe = (fecha: string) => {
    const k = Math.floor((new Date(fecha + "T00:00:00").getTime() - l0.getTime()) / (7 * DIA));
    return k < 0 ? 0 : k;
  };
  for (const m of cobros) {
    const k = semanaDe(m.fechaCaja);
    if (k >= semanas) continue;
    const v = importeCaja(m.doc);
    filas[k].cobros += v;
    filas[k].detalle.push({ texto: `${m.doc.contraparte} ${m.doc.numero}`, importe: v, clase: "cobro", vencido: m.diasVencido > 0 });
  }
  for (const m of pagos) {
    const k = semanaDe(m.fechaCaja);
    if (k >= semanas) continue;
    const v = importeCaja(m.doc);
    filas[k].pagos += v;
    filas[k].detalle.push({ texto: `${m.doc.contraparte} ${m.doc.numero}`, importe: -v, clase: "pago", vencido: m.diasVencido > 0 });
  }
  for (const r of recurrentesFuturos(docs, hoy, fin)) {
    const k = semanaDe(r.fecha);
    if (k >= semanas) continue;
    filas[k].recurrentes += r.importe;
    filas[k].detalle.push({ texto: r.texto, importe: -r.importe, clase: "recurrente" });
  }
  let saldo = saldoInicial;
  for (const f of filas) {
    saldo += f.cobros - f.pagos - f.recurrentes;
    f.saldoFinal = saldo;
  }
  return filas;
}
