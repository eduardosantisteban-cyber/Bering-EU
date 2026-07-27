import Anthropic from "@anthropic-ai/sdk";
import { EXTRACTION_PROMPT, CATEGORIAS } from "./constants";
import type { ExtractedPresupuesto } from "./types";

const MODEL = "claude-sonnet-5";

function getClient() {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    throw new Error("Falta ANTHROPIC_API_KEY en las variables de entorno");
  }
  return new Anthropic({ apiKey });
}

function tryParseJSON(raw: string): unknown {
  try {
    return JSON.parse(raw);
  } catch {
    const start = raw.indexOf("{");
    const end = raw.lastIndexOf("}");
    if (start !== -1 && end !== -1 && end > start) {
      let candidate = raw.slice(start, end + 1);
      candidate = candidate.replace(/,\s*([}\]])/g, "$1");
      return JSON.parse(candidate);
    }
    throw new Error("No se encontró un objeto JSON en la respuesta");
  }
}

function normalizeStr(s: unknown): string {
  return String(s ?? "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .trim()
    .toLowerCase();
}

function normalizeCategoria(cat: unknown): string {
  if (!cat) return "";
  const target = normalizeStr(cat);
  const found = CATEGORIAS.find((c) => normalizeStr(c) === target);
  return found ?? "";
}

async function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function extractOnce(base64Pdf: string): Promise<ExtractedPresupuesto> {
  const client = getClient();
  const response = await client.messages.create({
    model: MODEL,
    max_tokens: 8000,
    messages: [
      {
        role: "user",
        content: [
          {
            type: "document",
            source: {
              type: "base64",
              media_type: "application/pdf",
              data: base64Pdf,
            },
          },
          { type: "text", text: EXTRACTION_PROMPT },
        ],
      },
    ],
  });

  const textBlock = response.content.find((b) => b.type === "text");
  if (!textBlock || textBlock.type !== "text") {
    throw new Error("Respuesta sin contenido de texto");
  }
  const raw = textBlock.text.replace(/```json|```/g, "").trim();

  let parsed: unknown;
  try {
    parsed = tryParseJSON(raw);
  } catch (e) {
    const err = new Error(
      `No se pudo interpretar la respuesta de la IA (${(e as Error).message})`
    );
    (err as Error & { rawResponse?: string }).rawResponse = raw;
    throw err;
  }

  const extracted = parsed as ExtractedPresupuesto;
  extracted.items = (extracted.items ?? []).map((it, i) => ({
    ...it,
    grupo: it.grupo ?? i + 1,
    es_accesorio: !!it.es_accesorio,
    categoria: normalizeCategoria(it.categoria),
    marca: extracted.proveedor || it.marca || "",
  }));
  return extracted;
}

export async function extractFromPdfWithRetry(
  base64Pdf: string,
  maxAttempts = 3
): Promise<ExtractedPresupuesto> {
  let lastErr: unknown;
  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      return await extractOnce(base64Pdf);
    } catch (err) {
      lastErr = err;
      const isRateLimit =
        err instanceof Anthropic.RateLimitError ||
        (err instanceof Anthropic.APIError && err.status === 429);
      if (isRateLimit && attempt < maxAttempts) {
        await sleep(attempt * 4000);
        continue;
      }
      throw err;
    }
  }
  throw lastErr;
}
