export const BRAND = {
  charcoal: "#282828",
  red: "#e83038",
  gray: "#606060",
  bg: "#f5f4f2",
  panel: "#ffffff",
  border: "#e2e0dc",
};

export const PDF_BUCKET = "presupuestos-pdfs";
export const FICHAS_BUCKET = "fichas-tecnicas-pdfs";

// Sube este número cada vez que se despliegue un cambio, y añade una
// línea al historial para saber qué trae cada versión.
export const APP_VERSION = "2.4.0";
export const CHANGELOG: { version: string; desc: string }[] = [
  {
    version: "2.4.0",
    desc: "Botón \"Google Sheet\" en el Cotizador, junto al de Excel: crea la misma hoja (con fórmulas de precio/subtotal/IVA/total) directamente en Google Sheets, dentro de la Unidad compartida del equipo, vía una cuenta de servicio de Google Cloud",
  },
  {
    version: "2.3.0",
    desc: "Integración experimental con Holded (CRM): desde el Cotizador, botón \"Crear presupuesto en Holded\" que busca/crea el contacto y crea el presupuesto como estimate — envío en un solo sentido, de esta app hacia Holded. Necesita probarse con una cuenta real antes de confiar en ella (ver README)",
  },
  {
    version: "2.2.0",
    desc: "El Cotizador empareja automáticamente cada línea con su ficha técnica (por marca + modelo) y añade un enlace de descarga directa por línea, más un botón para descargar todas de golpe y adjuntarlas al enviar el presupuesto",
  },
  {
    version: "2.1.0",
    desc: "Fichas técnicas: lista con vista previa de PDF integrada, y clasificación automática por IA (categoría/tipo/marca/modelo) al subir cada ficha, con botón para reclasificar",
  },
  {
    version: "2.0.1",
    desc: "Botón para limpiar filtros directamente en la barra lateral",
  },
  {
    version: "2.0.0",
    desc: "Nuevo layout con barra lateral (filtros + estado + backup) y cabecera rediseñada; catálogo de fichas técnicas independiente de los presupuestos (subir, clasificar por categoría/tipo/marca/modelo, consultar y descargar)",
  },
  {
    version: "1.5.0",
    desc: "Panel de estado y backup (botón junto a la versión): número de presupuestos/líneas, estado de conexión, botón de actualizar, y exportar/importar backup en JSON",
  },
  {
    version: "1.4.3",
    desc: "La subida de PDF ya no reconstruye la URL firmada de Supabase en el navegador: usa directamente la URL que genera el servidor, con un PUT simple (arregla el \"Invalid path specified in request URL\" persistente y simplifica el código)",
  },
  {
    version: "1.4.2",
    desc: "Normaliza la URL de Supabase (quita una posible barra final) al construir el cliente, para evitar rutas de Storage inválidas; el error de subida ahora también muestra la ruta afectada",
  },
  {
    version: "1.4.1",
    desc: "Corrige la subida de PDF con espacios u otros caracteres en el nombre del archivo (fallaba con \"Invalid path specified in request URL\" en Supabase Storage)",
  },
  {
    version: "1.4.0",
    desc: "Tests automáticos (Vitest) para la normalización de marcas, la reparación del JSON de la IA y el cálculo de precios/IVA del cotizador — los tres sitios donde ya hemos tenido bugs reales",
  },
  {
    version: "1.3.3",
    desc: "Columna de número de presupuesto en el listado principal",
  },
  {
    version: "1.3.2",
    desc: "La consolidación de marcas ahora también ignora guiones, sufijos societarios (SA, SL, SLU, BV...) y diferencias de espaciado interno, para que variantes como \"NOVOFERM-ALSAL S.A.\", \"TRANSMAVE,S.L.\" o \"VanWijk Nederland bv\" se agrupen correctamente",
  },
  {
    version: "1.3.1",
    desc: "Las variantes de escritura de una misma marca/proveedor (p. ej. \"NOVOFERM ALSAL, SA\" y \"NOVOFERM ALSAL, S.A.\") se consolidan en el filtro de marcas y en el contador de proveedores del comparador",
  },
  {
    version: "1.3.0",
    desc: "Los PDF se suben directo a Supabase Storage desde el navegador (evita el límite de tamaño de las funciones de Vercel); prompt de extracción reforzado para presupuestos con precios agrupados por partida y páginas de fichas técnicas/condiciones generales; reparación automática de JSON incompleto de la IA",
  },
  { version: "1.2.1", desc: "Cabecera del panel principal en negro" },
  { version: "1.2.0", desc: "Filtro por año en el listado principal" },
  {
    version: "1.1.0",
    desc: "Logotipo en la cabecera, enlace de Google Drive disponible ya en la pantalla de subida (antes solo al editar), y el filtro de categoría vuelve a mostrar las 11 categorías fijas",
  },
  {
    version: "1.0.0",
    desc: "Versión inicial de la app real: migración desde el artefacto de Claude.ai a Next.js + Supabase, con subida de PDF, extracción por IA, comparador de precios y cotizador",
  },
];

export const CATEGORIAS = [
  "Muelle de carga",
  "Minidock",
  "Puerta seccional",
  "Puerta rápida",
  "Puerta cortafuegos",
  "Accesorio muelle de carga",
  "Accesorio puerta seccional",
  "Accesorio puerta rápida",
  "Accesorio puerta cortafuegos",
  "Transporte",
  "Instalación",
] as const;

export type Categoria = (typeof CATEGORIAS)[number];

export const EXTRACTION_PROMPT = `Eres un asistente que extrae datos de presupuestos, ofertas o confirmaciones de pedido de proveedores de puertas industriales y equipos de muelle de carga. Estos documentos vienen de proveedores distintos (Novoferm, Cadlan, Hörmann, Assa Abloy, etc.) con formatos de tabla muy variados: a veces es una lista plana de productos, y otras veces cada producto principal viene seguido de líneas de accesorios, transporte o montaje asociadas a él (identifícalas por contexto: aparecen justo debajo del producto principal, normalmente sin negrita, con conceptos como "montaje", "transporte", "topes de goma", "tornillería", "carril", etc.).

IMPORTANTE — ámbito de páginas: el PDF puede incluir, además de la tabla de presupuesto en sí, páginas adicionales que NO debes usar para generar items:
- Páginas de condiciones generales de venta, alquiler o montaje, confirmación de pedido, datos de facturación/entrega en blanco, declaraciones de IVA, o cualquier texto legal/contractual sin tabla de precios.
- Páginas tipo "descripción completa de los productos ofertados", fichas técnicas, características de materiales, composición, homologaciones o normativas — describen productos con mucho detalle pero NUNCA incluyen columnas de cantidad/precio/importe por línea.
Identifica únicamente las páginas que contienen la tabla real del presupuesto (normalmente con cabeceras como "Código", "Descripción", "Unidades"/"Cantidad", "Precio", "Total"/"Importe", y un resumen final de Base imponible/IVA/Total). Extrae los items EXCLUSIVAMENTE de esas filas.

Algunos documentos agrupan un producto junto con sus componentes en un "paquete" o "partida" con UN ÚNICO precio total al final del grupo (ej. "Importe total partida ALUMROLL 3 X 3: 2.856,27 €"), en vez de precio por cada línea individual. En ese caso: crea un único item principal para el grupo con precio_unitario = ese importe total, y crea items adicionales con es_accesorio: true para cada componente relevante (motor, guías, lona, cuadro de control, etc.) usando precio_unitario: null en esos accesorios, ya que no tienen precio propio — todos comparten el mismo "grupo" que el item principal. No repartas el importe total entre las sub-líneas ni inventes precios individuales para ellas.

Analiza el PDF adjunto y devuelve ÚNICAMENTE un objeto JSON válido, sin texto adicional, sin markdown, sin explicaciones ni comentarios, con esta estructura exacta:

{
  "proveedor": "nombre de la empresa que emite el documento",
  "numero_presupuesto": "número de presupuesto, oferta o pedido si existe, si no null",
  "fecha_presupuesto": "fecha en formato YYYY-MM-DD, si no aparece usa null",
  "items": [
    {
      "codigo_articulo": "código o referencia interna del artículo tal como aparece en el documento, o null",
      "categoria": "DEBE ser EXACTAMENTE uno de estos valores textuales, sin variaciones: \\"Muelle de carga\\", \\"Minidock\\", \\"Puerta seccional\\", \\"Puerta rápida\\", \\"Puerta cortafuegos\\", \\"Accesorio muelle de carga\\", \\"Accesorio puerta seccional\\", \\"Accesorio puerta rápida\\", \\"Accesorio puerta cortafuegos\\", \\"Transporte\\", \\"Instalación\\"",
      "tipo_producto": "ej. puerta rápida, puerta seccional, puerta cortafuegos, dock leveler, minidock, dock shelter, accesorio, transporte, montaje, u otro",
      "marca": "usa EXACTAMENTE el mismo texto que el campo \\"proveedor\\" de este documento; la marca de todas las líneas es siempre el proveedor que emite el presupuesto, no un fabricante distinto",
      "modelo": "modelo, referencia o descripción corta del producto",
      "medidas": "dimensiones si aparecen, ej. 4000x4000mm, o null",
      "precio_unitario": numero decimal JSON usando SIEMPRE punto como separador decimal y SIN separador de miles (ej. si el documento pone "5.426,64" debes escribir 5426.64; si pone "84,50" escribe 84.50),
      "moneda": "EUR u otra",
      "cantidad": numero entero o decimal, usa 1 si no se especifica,
      "es_accesorio": true si esta línea es un accesorio, transporte, montaje o servicio asociado al producto principal anterior, false si es un producto principal,
      "grupo": numero entero empezando en 1, que agrupa cada producto principal junto con sus accesorios asociados (todas las líneas de un mismo grupo comparten el mismo número),
      "notas": "cualquier detalle relevante adicional QUE YA APAREZCA en la propia fila de la tabla de presupuesto (nunca copies texto de fichas técnicas de otras páginas; resume en una frase breve, no pegues párrafos completos), o null"
    }
  ]
}

Reglas para asignar "categoria" (aplícalas siempre, no dejes ninguna línea sin categoría):
- Si el producto es un dock leveler o plataforma niveladora de muelle → "Muelle de carga".
- Si es un minidock → "Minidock".
- Si es una puerta seccional → "Puerta seccional".
- Si es una puerta rápida (enrollable, de PVC, de alta velocidad) → "Puerta rápida".
- Si es una puerta cortafuegos (EI, resistente al fuego) → "Puerta cortafuegos".
- Si la línea es transporte de cualquier producto → "Transporte".
- Si la línea es montaje, instalación o puesta en marcha → "Instalación".
- Si la línea es un accesorio, componente o repuesto asociado a un producto principal (topes de goma, carriles, tornillería, mandos, fotocélulas, etc.), usa la categoría de accesorio correspondiente al tipo del producto principal de su mismo grupo: "Accesorio muelle de carga", "Accesorio puerta seccional", "Accesorio puerta rápida" o "Accesorio puerta cortafuegos".
- Si tras aplicar estas reglas sigues sin poder determinar la categoría con certeza, elige la opción de la lista que más se aproxime; nunca dejes "categoria" vacío o fuera de la lista.

Reglas importantes:
- Los precios y cantidades deben ser SIEMPRE números JSON válidos (sin comas, sin símbolos de moneda, sin espacios). Convierte cualquier formato español de miles/decimales al estándar JSON.
- No uses comas finales (trailing commas) en ningún array u objeto.
- Incluye TODAS las líneas de la tabla de presupuesto, sin resumir ni omitir ninguna, aunque haya muchas.
- NO generes ningún item a partir de páginas de condiciones generales, confirmación de pedido, o fichas técnicas/descripción completa de productos, aunque mencionen modelos, medidas o características — si una página no tiene una fila con cantidad y precio asociados, ignórala por completo.
- Si un dato no aparece, usa null. No inventes datos.
- MUY IMPORTANTE — validez del JSON: dentro de cualquier valor de texto (medidas, modelo, notas, etc.) NUNCA uses el símbolo de comilla doble (") suelto, ni siquiera para indicar pulgadas. Si el documento usa pulgadas (ej. 36" x 48"), escríbelo como "36 in x 48 in" o "36pulg x 48pulg", nunca con el símbolo " literal. Si necesitas incluir una comilla doble dentro de un texto por cualquier motivo, escápala como \\" . Antes de terminar tu respuesta, revisa mentalmente que cada string abra y cierre correctamente y que no haya comillas sueltas sin escapar.
- Devuelve solo el JSON, nada más: ni texto antes, ni después, ni bloques de markdown.`;

export const FICHA_EXTRACTION_PROMPT = `Eres un asistente que clasifica fichas técnicas (hojas de especificaciones) de productos de puertas industriales y equipos de muelle de carga, para catalogarlas en una base de datos.

Analiza el PDF adjunto y devuelve ÚNICAMENTE un objeto JSON válido, sin texto adicional, sin markdown, sin explicaciones ni comentarios, con esta estructura exacta:

{
  "categoria": "DEBE ser EXACTAMENTE uno de estos valores textuales, sin variaciones: \\"Muelle de carga\\", \\"Minidock\\", \\"Puerta seccional\\", \\"Puerta rápida\\", \\"Puerta cortafuegos\\", \\"Accesorio muelle de carga\\", \\"Accesorio puerta seccional\\", \\"Accesorio puerta rápida\\", \\"Accesorio puerta cortafuegos\\", \\"Transporte\\", \\"Instalación\\"",
  "tipo_producto": "ej. puerta rápida, puerta seccional, puerta cortafuegos, dock leveler, minidock, dock shelter, accesorio, u otro, o null si no se puede determinar",
  "marca": "fabricante o marca del producto tal como aparece en el documento (normalmente en el logo o cabecera de la ficha), o null si no aparece",
  "modelo": "modelo o referencia comercial del producto, o null si no aparece"
}

Reglas para asignar "categoria" (aplícalas siempre, no la dejes vacía si puedes inferirla):
- Si el producto es un dock leveler o plataforma niveladora de muelle → "Muelle de carga".
- Si es un minidock → "Minidock".
- Si es una puerta seccional → "Puerta seccional".
- Si es una puerta rápida (enrollable, de PVC, de alta velocidad) → "Puerta rápida".
- Si es una puerta cortafuegos (EI, resistente al fuego) → "Puerta cortafuegos".
- Si es un accesorio, componente o repuesto (topes de goma, carriles, tornillería, mandos, fotocélulas, etc.), usa la categoría de accesorio correspondiente al tipo de producto principal al que pertenece: "Accesorio muelle de carga", "Accesorio puerta seccional", "Accesorio puerta rápida" o "Accesorio puerta cortafuegos".
- Si tras aplicar estas reglas sigues sin poder determinar la categoría con certeza, deja "categoria" como cadena vacía "" en vez de inventar una.

Reglas importantes:
- No inventes datos: si un campo no aparece claramente en el documento, usa null (o "" para categoria).
- Devuelve solo el JSON, nada más: ni texto antes, ni después, ni bloques de markdown.`;
