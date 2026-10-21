import { ESTADOS, ESTADOS_PRESUPUESTADO, type Oportunidad } from "./solicitudes";

// Calculadora de productividad comercial: cuánto tiempo libera la automatización por
// presupuesto y cuánto se podría subir el objetivo de venta. Funciones puras.

export interface Tarea {
  nombre: string;
  antes: number; // minutos
  ahora: number;
}

export const TAREAS: Tarea[] = [
  { nombre: "Registrar cliente y oportunidad en Holded", antes: 15, ahora: 1 },
  { nombre: "Leer email y planos, desglosar partidas", antes: 30, ahora: 5 },
  { nombre: "Buscar costes de proveedores, instalación y transporte", antes: 60, ahora: 15 },
  { nombre: "Montar el cálculo (márgenes, forma de pago)", antes: 25, ahora: 10 },
  { nombre: "Pedir precio a proveedores", antes: 15, ahora: 3 },
  { nombre: "Crear el presupuesto en Holded con PDF y condiciones", antes: 20, ahora: 2 },
  { nombre: "Buscar y adjuntar fichas técnicas", antes: 15, ahora: 2 },
  { nombre: "Revisión final antes de enviar", antes: 10, ahora: 10 },
];

export interface Supuestos {
  vol: number; // solicitudes / mes por comercial
  horas: number; // horas de trabajo / mes
  cierre: number; // % tasa de cierre actual
  ticket: number; // € importe medio por pedido (sin IVA)
  reinv: number; // % del tiempo ahorrado dedicado a vender
  capt: number; // h para conseguir 1 solicitud nueva
  dcierre: number; // puntos % de mejora de cierre por responder antes
  prud: number; // % de la mejora que se exige
}

export type Escenario = "conservador" | "base" | "optimista";

export const ESCENARIOS: Record<Escenario, { reinv: number; capt: number; dcierre: number; prud: number; descripcion: string }> = {
  conservador: {
    reinv: 30,
    capt: 4,
    dcierre: 0,
    prud: 50,
    descripcion: "Solo se cuenta el tiempo reinvertido en conseguir más solicitudes; responder antes no mejora el cierre.",
  },
  base: {
    reinv: 50,
    capt: 3,
    dcierre: 2,
    prud: 60,
    descripcion: "La mitad del tiempo liberado se dedica a vender y responder antes mejora un poco el cierre.",
  },
  optimista: {
    reinv: 70,
    capt: 2,
    dcierre: 4,
    prud: 75,
    descripcion: "La mayor parte del tiempo liberado se dedica a vender y el cliente valora mucho la rapidez.",
  },
};

export const SUPUESTOS_INICIALES: Supuestos = { vol: 15, horas: 140, cierre: 20, ticket: 20000, ...soloNumeros(ESCENARIOS.base) };

function soloNumeros(e: (typeof ESCENARIOS)[Escenario]) {
  return { reinv: e.reinv, capt: e.capt, dcierre: e.dcierre, prud: e.prud };
}

export function supuestosDeEscenario(s: Supuestos, e: Escenario): Supuestos {
  return { ...s, ...soloNumeros(ESCENARIOS[e]) };
}

export interface Resultado {
  minAntes: number;
  minAhora: number;
  horasLiberadas: number; // h / mes
  pctTiempo: number; // 0-1
  veces: number | null; // × más rápido
  extra: number; // solicitudes extra / mes
  ventaBase: number; // € / mes
  ventaVolumen: number;
  ventaRapidez: number;
  mejora: number; // 0-1 (teórica)
  subida: number; // 0-1 (recomendada)
  objetivoActual: number; // € / año
  objetivoPropuesto: number;
}

export function calcularProductividad(s: Supuestos, tareas: Tarea[]): Resultado {
  const minAntes = tareas.reduce((x, t) => x + (t.antes || 0), 0);
  const minAhora = tareas.reduce((x, t) => x + (t.ahora || 0), 0);
  const horas = Math.max(s.horas, 1);
  const cierre = s.cierre / 100;
  const reinv = s.reinv / 100;
  const dc = s.dcierre / 100;
  const prud = s.prud / 100;
  const horasLiberadas = (Math.max(minAntes - minAhora, 0) * s.vol) / 60;
  const horasPorExtra = s.capt + minAhora / 60;
  const extra = horasPorExtra > 0 ? (horasLiberadas * reinv) / horasPorExtra : 0;
  const cierreNuevo = Math.min(cierre + dc, 1);
  const ventaBase = s.vol * cierre * s.ticket;
  const ventaVolumen = extra * cierreNuevo * s.ticket;
  const ventaRapidez = s.vol * dc * s.ticket;
  const mejora = ventaBase > 0 ? (ventaVolumen + ventaRapidez) / ventaBase : 0;
  const subida = mejora * prud;
  return {
    minAntes,
    minAhora,
    horasLiberadas,
    pctTiempo: horasLiberadas / horas,
    veces: minAhora > 0 ? minAntes / minAhora : null,
    extra,
    ventaBase,
    ventaVolumen,
    ventaRapidez,
    mejora,
    subida,
    objetivoActual: ventaBase * 12,
    objetivoPropuesto: ventaBase * 12 * (1 + subida),
  };
}

/**
 * Datos reales del portal para la calculadora: solicitudes al mes por comercial (últimos 90 días),
 * tasa de cierre (ganadas / cerradas, desde el inicio) e importe medio (ganadas; si no hay, presupuestadas).
 * Devuelve solo los campos que se pueden calcular.
 */
export function datosReales(ops: Oportunidad[], ahora: Date): { vol?: number; cierre?: number; ticket?: number; detalle: string[] } {
  const detalle: string[] = [];
  const res: { vol?: number; cierre?: number; ticket?: number; detalle: string[] } = { detalle };
  const hace90 = ahora.getTime() - 90 * 86400000;
  const recientes = ops.filter((o) => o.fechaSolicitud && new Date(o.fechaSolicitud).getTime() >= hace90);
  const comerciales = new Set(recientes.map((o) => o.registradoPor).filter(Boolean)).size || 1;
  if (recientes.length) {
    res.vol = Math.round((recientes.length / 3 / comerciales) * 10) / 10;
    detalle.push(`${recientes.length} solicitudes en 90 días entre ${comerciales} comercial(es)`);
  }
  const ganadas = ops.filter((o) => o.estado === ESTADOS.GANADO);
  const cerradas = ganadas.length + ops.filter((o) => o.estado === ESTADOS.PERDIDO).length;
  if (cerradas) {
    res.cierre = Math.round((100 * ganadas.length) / cerradas);
    detalle.push(`cierre: ${ganadas.length} ganadas de ${cerradas} cerradas`);
  }
  const conImporte = (l: Oportunidad[]) => l.filter((o) => (o.importe || 0) > 0);
  const base = conImporte(ganadas).length ? conImporte(ganadas) : conImporte(ops.filter((o) => ESTADOS_PRESUPUESTADO.includes(o.estado)));
  if (base.length) {
    res.ticket = Math.round(base.reduce((s, o) => s + (o.importe || 0), 0) / base.length / 100) * 100;
    detalle.push(`importe medio de ${base.length} ${conImporte(ganadas).length ? "ganadas" : "presupuestadas"}`);
  }
  return res;
}
