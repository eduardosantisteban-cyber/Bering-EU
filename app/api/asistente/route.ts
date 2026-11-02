import { NextResponse } from "next/server";
import Anthropic from "@anthropic-ai/sdk";
import { leerRangoOpcional, leerRangos } from "@/lib/googleSheets";
import { leerPeticiones } from "@/lib/darsenaServer";
import { solicitudesSheetId } from "@/lib/portalConfig";
import { codigosEnTexto, recortarHistorial, SISTEMA_ASISTENTE, type MensajeChat } from "@/lib/asistente";
import { emailDeSesion, SESSION_COOKIE } from "@/lib/auth";

// Asistente de Dársena: POST { mensajes: [{rol, texto}], pagina } → { respuesta }.
// Protegido por la sesión del portal (cualquiera del equipo). Usa ANTHROPIC_API_KEY (la misma que lee los PDF).
// Añade datos en directo: estado del ciclo, últimos errores y, si se cita un código BEUQ/MMQ, su fila, peticiones e historial.

export const maxDuration = 30;

const MODELO = process.env.ASISTENTE_MODELO || "claude-sonnet-5-5";
const COLUMNAS = ["Fecha email", "Nº", "Empresa", "Contacto", "Email", "Productos", "Cantidades", "Medidas", "Resumen", "Adjuntos", "Asunto",
  "Enlace Gmail", "Lleva", "Estado", "Presupuesto Holded", "Fecha estado", "Importe", "", "Seguimiento 1", "Sin seguimiento", "Seguimiento 2",
  "Aviso llamada", "Motivo pérdida", "Canal", "Provincia", "Faltan datos"];

const fechaSerie = (v: unknown) =>
  typeof v === "number" && v > 20000 && v < 80000 ? new Date(Math.round((v - 25569) * 86400000)).toISOString().slice(0, 16).replace("T", " ") : String(v ?? "");

async function datosEnDirecto(texto: string, yo: string | null): Promise<string> {
  const partes: string[] = [];
  const sheetId = solicitudesSheetId();
  const [sistema, errores] = await Promise.all([
    leerRangoOpcional(sheetId, "Sistema!A1:C20").catch(() => []),
    leerRangoOpcional(sheetId, "Errores!A2:E201").catch(() => []),
  ]);
  if (sistema.length) partes.push("ESTADO DEL SCRIPT:\n" + sistema.filter((r) => r?.[0]).map((r) => `${r[0]}: ${r[1] ?? ""}`).join("\n"));
  const ultimos = errores.filter((r) => r?.[0]).slice(-8).reverse();
  if (ultimos.length) partes.push("ÚLTIMOS ERRORES (más reciente primero):\n" + ultimos.map((r) => `${r[0]} · ${r[1]} · ${r[2]} · ${r[3]} · ${String(r[4]).slice(0, 220)}`).join("\n"));

  // "¿Qué tengo pendiente?", "mis oportunidades"… → las oportunidades abiertas de quien pregunta
  if (yo && /\b(mis|m[ií]as?|tengo|pendiente|me toca|llevo)\b/i.test(texto)) {
    const [filas] = await leerRangos(sheetId, ["Solicitudes!A2:Z"]);
    const mias = filas
      .filter((r) => String(r?.[12] ?? "").toLowerCase() === yo && !/^(ganado|perdido)$/i.test(String(r?.[13] ?? "")))
      .slice(-25)
      .map((r) => `${r[1]} · ${r[2]} · ${r[13]} · ${r[16] ? Math.round(Number(r[16])) + " €" : "sin importe"} · desde ${fechaSerie(r[15] || r[0]).slice(0, 10)}${r[25] ? " · faltan datos: " + String(r[25]).slice(0, 120) : ""}`);
    partes.push(`OPORTUNIDADES ABIERTAS DE ${yo} (${mias.length}):\n` + (mias.join("\n") || "ninguna"));
  }

  const codigos = codigosEnTexto(texto);
  if (codigos.length) {
    const [[filas], peticiones, historial] = await Promise.all([
      leerRangos(sheetId, ["Solicitudes!A2:Z"]),
      leerPeticiones(sheetId).catch(() => []),
      leerRangoOpcional(sheetId, "'Historial estados'!A2:F").catch(() => []),
    ]);
    for (const c of codigos) {
      const f = filas.find((r) => String(r?.[1] ?? "").trim().toUpperCase() === c);
      if (!f) {
        partes.push(`${c}: no está en la hoja Solicitudes.`);
        continue;
      }
      const campos = COLUMNAS.map((n, i) => (n && f[i] !== "" && f[i] !== undefined && f[i] !== null ? `${n}: ${i === 0 || i === 15 ? fechaSerie(f[i]) : String(f[i]).slice(0, 300)}` : ""))
        .filter((x) => x && !/^Enlace Gmail/.test(x));
      const pets = peticiones.filter((p) => p.codigo === c).map((p) => `${p.proveedor} (${p.estado}${p.nRecordatorios ? `, ${p.nRecordatorios} recordatorio(s)` : ""}${p.resultado ? ": " + p.resultado.split("\n")[0].slice(0, 120) : ""})`);
      const hist = historial.filter((r) => String(r?.[1] ?? "").trim().toUpperCase() === c).map((r) => `${fechaSerie(r[0])}: ${r[2]} → ${r[3]}`);
      partes.push(
        `OPORTUNIDAD ${c}:\n${campos.join("\n")}` +
          (pets.length ? `\nPeticiones a proveedores: ${pets.join(" · ")}` : "") +
          (hist.length ? `\nHistorial de estados: ${hist.join(" · ")}` : "")
      );
    }
  }
  return partes.join("\n\n");
}

export async function POST(req: Request) {
  const key = process.env.ANTHROPIC_API_KEY;
  if (!key) return NextResponse.json({ error: "Falta ANTHROPIC_API_KEY en Vercel." }, { status: 500 });
  let body: { mensajes?: MensajeChat[]; pagina?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Petición no válida" }, { status: 400 });
  }
  const mensajes = recortarHistorial(Array.isArray(body.mensajes) ? body.mensajes : []);
  while (mensajes.length && mensajes[0].rol !== "usuario") mensajes.shift();
  // Mensajes seguidos del mismo rol (p. ej. tras un error) se juntan
  for (let i = mensajes.length - 1; i > 0; i--) {
    if (mensajes[i].rol === mensajes[i - 1].rol) {
      mensajes[i - 1] = { rol: mensajes[i].rol, texto: mensajes[i - 1].texto + "\n" + mensajes[i].texto };
      mensajes.splice(i, 1);
    }
  }
  if (!mensajes.length || mensajes[mensajes.length - 1].rol !== "usuario") return NextResponse.json({ error: "Falta la pregunta" }, { status: 400 });

  // Datos en directo (si fallan, el asistente responde igual con lo que sabe)
  const cookie = (req.headers.get("cookie") || "").split(/;\s*/).find((c) => c.startsWith(SESSION_COOKIE + "="));
  const yo = emailDeSesion(cookie ? decodeURIComponent(cookie.slice(SESSION_COOKIE.length + 1)) : null);
  let directo = "";
  try {
    directo = await datosEnDirecto(mensajes.filter((m) => m.rol === "usuario").slice(-3).map((m) => m.texto).join("\n"), yo);
  } catch (e) {
    directo = "(No se pudieron leer los datos en directo: " + (e as Error).message.slice(0, 120) + ")";
  }
  const sistema =
    SISTEMA_ASISTENTE +
    `\n\nHOY: ${new Date().toLocaleString("es-ES", { timeZone: "Europe/Madrid" })} · El usuario está en la página ${String(body.pagina || "/").slice(0, 60)} de Dársena.` +
    (yo ? ` Quien pregunta es ${yo} (cuando diga «mis» o «yo» se refiere a sus oportunidades).` : " Ha entrado con la contraseña del equipo: no sabes quién es.") +
    (directo ? `\n\nDATOS EN DIRECTO:\n${directo}` : "");

  try {
    const cliente = new Anthropic({ apiKey: key });
    const r = await cliente.messages.create({
      model: MODELO,
      max_tokens: 450,
      system: sistema,
      messages: mensajes.map((m) => ({ role: m.rol === "usuario" ? ("user" as const) : ("assistant" as const), content: m.texto })),
    });
    const respuesta = r.content
      .map((b) => (b.type === "text" ? b.text : ""))
      .join("")
      .trim();
    return NextResponse.json({ respuesta: respuesta || "No tengo respuesta para eso. Pregunta a Eduardo." });
  } catch (e) {
    return NextResponse.json({ error: "El asistente no está disponible ahora: " + (e as Error).message.slice(0, 160) }, { status: 502 });
  }
}
