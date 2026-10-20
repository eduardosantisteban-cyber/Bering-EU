// Configuración del portal (Inicio / Oportunidades / Automatizaciones).
//
// Los datos de las oportunidades salen de la tabla "Solicitudes" del Google
// Sheet que mantiene la automatización de Apps Script (gmail_a_holded.gs).
// Las reglas de seguimiento y de "necesitan atención" son las mismas que usa
// ese script: si se cambian allí (CONFIG.SEGUIMIENTO_DIAS…), cambiarlas aquí.

export const SEGUIMIENTO = {
  DIAS_1: 3, // 1er email al cliente
  DIAS_2: 10, // 2º email
  DIAS_LLAMADA: 21, // aviso al comercial para llamar
};

export const AVISOS = {
  DIAS_ENVIADO: 7, // enviado sin respuesta (si no hay seguimiento automático)
  DIAS_PENDIENTE: 3, // sin presupuestar / sin enviar
};

// Tipos de producto tal y como los escribe el script en la columna "Productos"
export const TIPOS_PRODUCTO: { clave: string; nombre: string }[] = [
  { clave: "muelle de carga", nombre: "Muelle de carga" },
  { clave: "puerta seccional", nombre: "Puerta seccional" },
  { clave: "puerta rapida", nombre: "Puerta rápida" },
  { clave: "puerta cortafuego", nombre: "Puerta cortafuegos" },
  { clave: "sin clasificar", nombre: "Sin clasificar" },
];

/** ID del Google Sheet "Solicitudes" (el mismo HOJA_ID de las propiedades del script). */
export function solicitudesSheetId(): string {
  // Tolera espacios o mayúsculas distintas en el nombre de la variable (fácil de colar al pegarla en Vercel)
  const clave = Object.keys(process.env).find((k) => k.trim().toUpperCase() === "SOLICITUDES_SHEET_ID");
  let id = (clave ? process.env[clave] || "" : "").trim();
  // Si se pegó la URL entera de la hoja en vez del ID, se saca el ID
  const m = id.match(/\/spreadsheets\/d\/([\w-]+)/);
  if (m) id = m[1];
  if (!id) {
    const parecidas = Object.keys(process.env).filter((k) => /SOLICITUD|SHEET/i.test(k) && !/SERVICE_ACCOUNT/i.test(k));
    throw new Error(
      "Falta SOLICITUDES_SHEET_ID en las variables de entorno de este despliegue" +
        ` (entorno: ${process.env.VERCEL_ENV || "desconocido"}, rama: ${process.env.VERCEL_GIT_COMMIT_REF || "desconocida"}).` +
        (parecidas.length ? ` Variables con nombre parecido: ${parecidas.join(", ")}.` : " No hay ninguna variable con un nombre parecido.") +
        (clave ? " La variable existe pero está vacía." : "") +
        " En Vercel → Settings → Environment Variables, comprueba que está marcada para este entorno y vuelve a desplegar."
    );
  }
  return id;
}

export interface EnlacePortal {
  id: string;
  titulo: string;
  descripcion: string;
  url: string;
}

/** Accesos directos del Inicio. Los que dependen de una variable de entorno vacía no se muestran. */
export function enlacesPortal(): EnlacePortal[] {
  const sheetId = (process.env.SOLICITUDES_SHEET_ID || "").trim();
  const lista: (EnlacePortal | null)[] = [
    {
      id: "holded",
      titulo: "Holded",
      descripcion: "CRM, presupuestos y facturas",
      url: process.env.PORTAL_URL_HOLDED || "https://app.holded.com",
    },
    sheetId
      ? {
          id: "solicitudes",
          titulo: "Tabla Solicitudes",
          descripcion: "Google Sheet con todas las oportunidades",
          url: `https://docs.google.com/spreadsheets/d/${sheetId}/edit`,
        }
      : null,
    process.env.PORTAL_URL_DRIVE
      ? {
          id: "drive",
          titulo: "Carpeta de presupuestos",
          descripcion: "Sheets y PDF de cada oportunidad en Drive",
          url: process.env.PORTAL_URL_DRIVE,
        }
      : null,
    {
      id: "guia",
      titulo: "Guía de uso",
      descripcion: "Cómo funciona la automatización (PDF)",
      url:
        process.env.PORTAL_URL_GUIA || "https://drive.google.com/file/d/1fAQs5QvbNY5Kou4rBjXovY5BWo1kWYny/view",
    },
    process.env.PORTAL_URL_FLUJO
      ? {
          id: "flujo",
          titulo: "Flujo del código",
          descripcion: "Diagramas de cómo funciona por dentro",
          url: process.env.PORTAL_URL_FLUJO,
        }
      : null,
    process.env.PORTAL_URL_APPS_SCRIPT
      ? {
          id: "script",
          titulo: "Apps Script",
          descripcion: "Proyecto de la automatización (pruebas y configuración)",
          url: process.env.PORTAL_URL_APPS_SCRIPT,
        }
      : null,
  ];
  return lista.filter((x): x is EnlacePortal => !!x);
}
