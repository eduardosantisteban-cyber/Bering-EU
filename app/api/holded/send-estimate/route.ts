import { NextResponse } from "next/server";
import { createEstimate, findOrCreateContact, type HoldedEstimateItem } from "@/lib/holded";

interface SendBody {
  clienteName?: string;
  clienteEmail?: string;
  items?: HoldedEstimateItem[];
}

export async function POST(request: Request) {
  const body = (await request.json().catch(() => null)) as SendBody | null;
  if (!body || !body.clienteName?.trim() || !Array.isArray(body.items) || body.items.length === 0) {
    return NextResponse.json(
      { error: "Faltan datos: nombre del cliente y al menos una línea" },
      { status: 400 }
    );
  }

  try {
    const contactId = await findOrCreateContact(body.clienteName, body.clienteEmail?.trim() || undefined);
    const estimate = await createEstimate(contactId, body.items);
    return NextResponse.json({ ok: true, id: estimate.id });
  } catch (err) {
    return NextResponse.json(
      { error: (err as Error).message || "No se pudo enviar el presupuesto a Holded" },
      { status: 502 }
    );
  }
}
