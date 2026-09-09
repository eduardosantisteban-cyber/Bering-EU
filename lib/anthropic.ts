import Anthropic from "@anthropic-ai/sdk";
import { EXTRACTION_PROMPT, FICHA_EXTRACTION_PROMPT, CATEGORIAS } from "./constants";
import { tryParseJSON } from "./jsonRepair";
import type { ExtractedPresupuesto } from "./types";

const MODEL = "claude-sonnet-5";

function getClient() {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    throw new Error("Falta ANTHROPIC_API_KEY en las variables de entorno");
  }
  return new Anthropic({ apiKey });
}

function normalizeStr(s: unknown): string {
  return String(s ?? "")
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
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

async function withRetry<T>(fn: () => Promise<T>, maxAttempts = 3): Promise<T> {
  let lastErr: unknown;
  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      return await fn();
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

async function askClaudeAboutPdf(base64Pdf: string, prompt: string, maxTokens: number): Promise<string> {
  const client = getClient();
  const response = await client.messages.create({
    model: MODEL,
    max_tokens: maxTokens,
    messages: [
      {
        role: "user",
        content: [
          {
            type: "document",
            source: { type: "base64", media_type: "application/pdf", data: base64Pdf },
          },
          { type: "text", text: prompt },
        ],
      },
    ],
  });

  const textBlock = response.content.find((b) => b.type === "text");
  if (!textBlock || textBlock.type !== "text") {
    throw new Error("Respuesta sin contenido de texto");
  }
  return textBlock.text.replace(/```json|```/g, "").trim();
}

function parseOrThrow(raw: string): unknown {
  try {
    return tryParseJSON(raw);
  } catch (e) {
    const err = new Error(`No se pudo interpretar la respuesta de la IA (${(e as Error).message})`);
    (err as Error & { rawResponse?: string }).rawResponse = raw;
    throw err;
  }
}

async function extractOnce(base64Pdf: string): Promise<ExtractedPresupuesto> {
  const raw = await askClaudeAboutPdf(base64Pdf, EXTRACTION_PROMPT, 16000);
  const extracted = parseOrThrow(raw) as ExtractedPresupuesto;
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
  return withRetry(() => extractOnce(base64Pdf), maxAttempts);
}

export interface FichaMetadata {
  categoria: string;
  tipo_producto: string | null;
  marca: string | null;
  modelo: string | null;
}

async function extractFichaMetadataOnce(base64Pdf: string): Promise<FichaMetadata> {
  const raw = await askClaudeAboutPdf(base64Pdf, FICHA_EXTRACTION_PROMPT, 500);
  const parsed = parseOrThrow(raw) as Partial<FichaMetadata>;
  return {
    categoria: normalizeCategoria(parsed.categoria),
    tipo_producto: parsed.tipo_producto || null,
    marca: parsed.marca || null,
    modelo: parsed.modelo || null,
  };
}

export async function extractFichaMetadataWithRetry(
  base64Pdf: string,
  maxAttempts = 3
): Promise<FichaMetadata> {
  return withRetry(() => extractFichaMetadataOnce(base64Pdf), maxAttempts);
}
