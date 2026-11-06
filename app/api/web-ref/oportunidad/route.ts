import { NextResponse } from "next/server";
import { ErrorEntrada, vincularOportunidad } from "@/lib/webRefVincular";

// Origen web de una oportunidad (con sesión del portal): lo llama la ficha al abrirse o al escribir un código.
// La lógica está en lib/webRefVincular.ts (la comparte la revisión automática cada hora).

export async function POST(req: Request) {
  let body: Record<string, unknown>;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Petición no válida" }, { status: 400 });
  }
  try {
    const r = await vincularOportunidad({
      codigo: String(body.codigo || ""),
      email: String(body.email || ""),
      fecha: body.fecha ? String(body.fecha) : null,
      asunto: String(body.asunto || ""),
      texto: String(body.texto || ""),
      ref: body.ref === undefined || body.ref === null || body.ref === "" ? null : String(body.ref),
    });
    return NextResponse.json(r);
  } catch (err) {
    if (err instanceof ErrorEntrada) return NextResponse.json({ error: err.message }, { status: 400 });
    console.error("web-ref oportunidad", err);
    return NextResponse.json({ error: (err as Error).message || "Error" }, { status: 500 });
  }
}
