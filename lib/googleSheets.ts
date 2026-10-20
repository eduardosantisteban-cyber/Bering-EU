import { JWT } from "google-auth-library";

// Crea el cotizador como una hoja de Google nativa (además del Excel que
// ya se genera en el navegador), usando una cuenta de servicio de Google
// Cloud — nadie del equipo tiene que iniciar sesión con Google, el
// backend crea la hoja directamente y queda en vuestra Unidad compartida
// de Workspace.

const SCOPES = ["https://www.googleapis.com/auth/spreadsheets", "https://www.googleapis.com/auth/drive"];

function getServiceAccount(): { client_email: string; private_key: string } {
  // Acepta el JSON de la clave en base64 (GOOGLE_SERVICE_ACCOUNT_JSON_BASE64) o pegado tal cual
  // (GOOGLE_SERVICE_ACCOUNT_JSON, o el JSON sin codificar en la variable base64).
  const raw = (process.env.GOOGLE_SERVICE_ACCOUNT_JSON_BASE64 || process.env.GOOGLE_SERVICE_ACCOUNT_JSON || "").trim();
  if (!raw) {
    throw new Error(
      "Falta la clave de la cuenta de servicio de Google: añade GOOGLE_SERVICE_ACCOUNT_JSON (el contenido del archivo .json de la clave, " +
        "pegado tal cual) en Vercel → Settings → Environment Variables, para Production y Preview"
    );
  }
  let json: { client_email?: string; private_key?: string };
  try {
    json = JSON.parse(raw.startsWith("{") ? raw : Buffer.from(raw, "base64").toString("utf-8"));
  } catch {
    throw new Error("La clave de la cuenta de servicio de Google no es un JSON válido (ni pegado tal cual ni en base64)");
  }
  if (!json.client_email || !json.private_key) {
    throw new Error("El JSON de la cuenta de servicio de Google no tiene client_email/private_key");
  }
  return { client_email: json.client_email, private_key: json.private_key };
}

async function getAccessToken(): Promise<string> {
  const { client_email, private_key } = getServiceAccount();
  const client = new JWT({ email: client_email, key: private_key, scopes: SCOPES });
  const { token } = await client.getAccessToken();
  if (!token) throw new Error("No se pudo autenticar con la cuenta de servicio de Google");
  return token;
}

async function googleFetch(url: string, token: string, options: RequestInit = {}): Promise<unknown> {
  const res = await fetch(url, {
    ...options,
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${token}`,
      ...(options.headers as Record<string, string> | undefined),
    },
  });
  const text = await res.text();
  let data: unknown = null;
  try {
    data = text ? JSON.parse(text) : null;
  } catch {
    // respuesta no-JSON, se usa el texto crudo si hace falta abajo
  }
  if (!res.ok) {
    const message =
      (data &&
        typeof data === "object" &&
        "error" in data &&
        typeof (data as { error: unknown }).error === "object" &&
        (data as { error: { message?: string } }).error.message) ||
      text ||
      `HTTP ${res.status}`;
    throw new Error(`Google (${res.status}): ${message}`);
  }
  return data;
}

export interface QuoteSheetItem {
  desc: string;
  medidas: string;
  cantidad: number;
  precioCoste: number;
  markup: number;
}

export interface QuoteSheetResult {
  id: string;
  url: string;
}

export async function createQuoteSheet(items: QuoteSheetItem[]): Promise<QuoteSheetResult> {
  const token = await getAccessToken();
  const folderId = process.env.GOOGLE_DRIVE_FOLDER_ID;
  const title = `Presupuesto Bering — ${new Date().toISOString().slice(0, 10)}`;

  const file = (await googleFetch("https://www.googleapis.com/drive/v3/files?supportsAllDrives=true", token, {
    method: "POST",
    body: JSON.stringify({
      name: title,
      mimeType: "application/vnd.google-apps.spreadsheet",
      ...(folderId ? { parents: [folderId] } : {}),
    }),
  })) as { id: string };

  const startRow = 5; // fila 1=título, 2=fecha, 3=vacía, 4=cabecera, 5+=líneas
  const values: (string | number | null)[][] = [
    [`PRESUPUESTO PARA CLIENTE — Bering EU`],
    [new Date().toLocaleDateString("es-ES")],
    [],
    ["Descripción", "Medidas", "Cantidad", "Precio coste (ud)", "Markup %", "Precio venta (ud)", "Subtotal"],
  ];
  items.forEach((it) => {
    values.push([it.desc, it.medidas, it.cantidad, it.precioCoste, it.markup, null, null]);
  });
  const lastDataRow = startRow + items.length - 1;
  values.push([]);
  const subtotalRow = lastDataRow + 2;
  values.push(["", "", "", "", "", "Subtotal (sin IVA)", null]);
  values.push(["", "", "", "", "", "IVA (21%)", null]);
  values.push(["", "", "", "", "", "TOTAL", null]);

  // Fórmulas por línea (F = precio venta con markup, G = subtotal de la
  // línea), y los totales — igual que en el Excel que ya se genera.
  for (let i = 0; i < items.length; i++) {
    const row = startRow + i;
    values[row - 1][5] = `=D${row}*(1+E${row}/100)`;
    values[row - 1][6] = `=F${row}*C${row}`;
  }
  values[subtotalRow - 1][6] = `=SUM(G${startRow}:G${lastDataRow})`;
  values[subtotalRow][6] = `=G${subtotalRow}*0.21`;
  values[subtotalRow + 1][6] = `=G${subtotalRow}+G${subtotalRow + 1}`;

  await googleFetch(
    `https://sheets.googleapis.com/v4/spreadsheets/${file.id}/values/A1?valueInputOption=USER_ENTERED`,
    token,
    { method: "PUT", body: JSON.stringify({ values }) }
  );

  // Formato: título y cabecera en negrita, columnas de precio en euros.
  await googleFetch(`https://sheets.googleapis.com/v4/spreadsheets/${file.id}:batchUpdate`, token, {
    method: "POST",
    body: JSON.stringify({
      requests: [
        {
          repeatCell: {
            range: { sheetId: 0, startRowIndex: 0, endRowIndex: 1 },
            cell: { userEnteredFormat: { textFormat: { bold: true, fontSize: 12 } } },
            fields: "userEnteredFormat.textFormat",
          },
        },
        {
          repeatCell: {
            range: { sheetId: 0, startRowIndex: 3, endRowIndex: 4 },
            cell: { userEnteredFormat: { textFormat: { bold: true } } },
            fields: "userEnteredFormat.textFormat",
          },
        },
        {
          repeatCell: {
            range: { sheetId: 0, startRowIndex: startRow - 1, endRowIndex: subtotalRow + 2, startColumnIndex: 3, endColumnIndex: 4 },
            cell: { userEnteredFormat: { numberFormat: { type: "CURRENCY", pattern: '#,##0.00 "€"' } } },
            fields: "userEnteredFormat.numberFormat",
          },
        },
        {
          repeatCell: {
            range: { sheetId: 0, startRowIndex: startRow - 1, endRowIndex: subtotalRow + 2, startColumnIndex: 5, endColumnIndex: 7 },
            cell: { userEnteredFormat: { numberFormat: { type: "CURRENCY", pattern: '#,##0.00 "€"' } } },
            fields: "userEnteredFormat.numberFormat",
          },
        },
      ],
    }),
  }).catch(() => {
    // El formato es cosmético: si falla, la hoja sigue siendo válida y
    // usable con los números en crudo.
  });

  return { id: file.id, url: `https://docs.google.com/spreadsheets/d/${file.id}/edit` };
}

// ───────── Lectura de hojas (portal: tabla Solicitudes) ─────────

/** Email de la cuenta de servicio (para decir con quién hay que compartir la hoja). */
export function serviceAccountEmail(): string {
  try {
    return getServiceAccount().client_email;
  } catch {
    return "";
  }
}

/**
 * Lee varios rangos de una hoja de una sola vez.
 * `render`: "UNFORMATTED_VALUE" (números y fechas como número de serie) o "FORMULA" (para los HYPERLINK).
 * Un rango de una pestaña que no existe hace fallar toda la llamada, así que las pestañas opcionales
 * se leen aparte con `leerRangoOpcional`.
 */
export async function leerRangos(
  spreadsheetId: string,
  ranges: string[],
  render: "UNFORMATTED_VALUE" | "FORMULA" = "UNFORMATTED_VALUE"
): Promise<unknown[][][]> {
  const token = await getAccessToken();
  const qs = ranges.map((r) => "ranges=" + encodeURIComponent(r)).join("&");
  const data = (await googleFetch(
    `https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}/values:batchGet?${qs}` +
      `&valueRenderOption=${render}&dateTimeRenderOption=SERIAL_NUMBER&majorDimension=ROWS`,
    token
  )) as { valueRanges?: { values?: unknown[][] }[] };
  return (data.valueRanges || []).map((v) => v.values || []);
}

/** Como leerRangos con un solo rango, pero devuelve [] si la pestaña no existe todavía. */
export async function leerRangoOpcional(spreadsheetId: string, range: string): Promise<unknown[][]> {
  try {
    return (await leerRangos(spreadsheetId, [range]))[0] || [];
  } catch (err) {
    if (/Unable to parse range|400/.test((err as Error).message)) return [];
    throw err;
  }
}
