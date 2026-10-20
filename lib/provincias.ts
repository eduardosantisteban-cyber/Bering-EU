import { normalizeStr } from "./format";

// Provincia de la obra a partir del texto de la solicitud (resumen, asunto, medidas…).
// Misma lista que provinciaDeTexto_ del script de Apps Script: provincias españolas y
// ciudades / zonas industriales frecuentes → provincia. Se queda con la que aparece antes.

const ALIAS: Record<string, string[]> = {
  "A Coruña": ["a coruna", "la coruna", "coruna", "santiago de compostela", "ferrol", "arteixo"],
  Álava: ["alava", "araba", "vitoria", "gasteiz"],
  Albacete: ["albacete", "hellin"],
  Alicante: ["alicante", "alacant", "elche", "elx", "benidorm", "elda", "ibi", "villena", "orihuela", "alcoy", "alcoi"],
  Almería: ["almeria", "el ejido", "roquetas de mar"],
  Asturias: ["asturias", "oviedo", "gijon", "aviles", "siero", "llanera"],
  Ávila: ["avila"],
  Badajoz: ["badajoz", "merida", "don benito", "almendralejo"],
  Barcelona: [
    "barcelona", "hospitalet", "badalona", "terrassa", "sabadell", "mataro", "granollers", "martorell", "sant boi",
    "el prat", "zona franca", "rubi", "cornella", "sant cugat", "mollet", "manresa", "vilafranca del penedes",
    "castellbisbal", "santa perpetua", "montcada", "barbera del valles", "parets del valles",
  ],
  Bizkaia: ["bizkaia", "vizcaya", "bilbao", "barakaldo", "getxo", "basauri", "derio", "zamudio", "erandio"],
  Burgos: ["burgos", "miranda de ebro", "aranda de duero"],
  Cáceres: ["caceres", "plasencia", "navalmoral de la mata"],
  Cádiz: ["cadiz", "jerez", "algeciras", "el puerto de santa maria", "chiclana", "los barrios"],
  Cantabria: ["cantabria", "torrelavega", "camargo"],
  Castellón: ["castellon", "castello", "villarreal", "vila-real", "vila real", "almazora", "burriana", "vinaros"],
  "Ciudad Real": ["ciudad real", "puertollano", "tomelloso", "valdepenas", "alcazar de san juan"],
  Córdoba: ["cordoba"],
  Cuenca: ["cuenca", "tarancon"],
  Gipuzkoa: ["gipuzkoa", "guipuzcoa", "san sebastian", "donostia", "irun", "eibar", "hernani", "lasarte"],
  Girona: ["girona", "gerona", "figueres", "blanes", "lloret de mar"],
  Granada: ["granada", "motril"],
  Guadalajara: ["guadalajara", "azuqueca", "cabanillas del campo", "alovera", "marchamalo"],
  Huelva: ["huelva"],
  Huesca: ["huesca", "monzon", "barbastro"],
  "Illes Balears": ["baleares", "illes balears", "mallorca", "palma de mallorca", "menorca", "ibiza", "eivissa", "formentera", "inca", "manacor"],
  Jaén: ["jaen", "linares", "andujar", "ubeda"],
  "La Rioja": ["la rioja", "logrono", "calahorra", "haro"],
  "Las Palmas": ["las palmas", "gran canaria", "lanzarote", "fuerteventura", "telde", "arrecife"],
  León: ["leon", "ponferrada"],
  Lleida: ["lleida", "lerida"],
  Lugo: ["lugo", "monforte de lemos"],
  Madrid: [
    "madrid", "getafe", "alcala de henares", "coslada", "torrejon de ardoz", "torrejon", "fuenlabrada", "leganes", "mostoles",
    "alcobendas", "san fernando de henares", "valdemoro", "arganda", "alcorcon", "parla", "san sebastian de los reyes",
    "tres cantos", "rivas-vaciamadrid", "humanes", "mejorada del campo", "daganzo", "meco", "paracuellos", "ciempozuelos",
    "navalcarnero", "grinon", "majadahonda", "las rozas", "pozuelo", "boadilla", "colmenar viejo", "valdemorillo",
  ],
  Málaga: ["malaga", "marbella", "antequera", "velez-malaga", "velez malaga", "fuengirola", "estepona", "torremolinos", "alhaurin"],
  Murcia: ["murcia", "cartagena", "lorca", "molina de segura", "alcantarilla", "yecla", "totana", "san javier"],
  Navarra: ["navarra", "pamplona", "iruna", "tudela", "noain", "berrioplano"],
  Ourense: ["ourense", "orense"],
  Palencia: ["palencia", "venta de banos"],
  Pontevedra: ["pontevedra", "vigo", "porrino", "o porrino", "vilagarcia", "redondela"],
  Salamanca: ["salamanca"],
  "Santa Cruz de Tenerife": ["santa cruz de tenerife", "tenerife", "la palma", "la laguna", "la gomera", "el hierro"],
  Segovia: ["segovia"],
  Sevilla: ["sevilla", "dos hermanas", "alcala de guadaira", "utrera", "ecija", "la rinconada"],
  Soria: ["soria"],
  Tarragona: ["tarragona", "reus", "tortosa", "valls", "cambrils", "el vendrell"],
  Teruel: ["teruel", "alcaniz"],
  Toledo: ["toledo", "talavera de la reina", "talavera", "illescas", "sesena", "yuncos", "quintanar"],
  Valencia: [
    "valencia", "sagunto", "paterna", "riba-roja", "ribarroja", "quart de poblet", "gandia", "alzira", "torrent", "manises",
    "aldaia", "alboraya", "puzol", "ontinyent", "xativa", "cheste", "loriguilla", "almussafes", "picassent", "betera",
  ],
  Valladolid: ["valladolid", "medina del campo", "laguna de duero"],
  Zamora: ["zamora", "benavente"],
  Zaragoza: ["zaragoza", "calatayud", "plaza logistica", "pla-za", "utebo", "cuarte de huerva", "la muela", "ejea"],
  Ceuta: ["ceuta"],
  Melilla: ["melilla"],
};

const escapar = (s: string) => s.replace(/[-.*+?^$(){}|[\]\\]/g, "\\$&");

const LISTA = Object.entries(ALIAS)
  .flatMap(([provincia, alias]) =>
    alias.map((a) => ({ a, provincia, re: new RegExp("(^|[^a-z0-9])" + escapar(a) + "(?![a-z0-9])") }))
  )
  .sort((x, y) => y.a.length - x.a.length);

/** Provincia que aparece antes en el texto ("" si ninguna). Ignora la dirección de Bering y "Banco Santander". */
export function provinciaDeTexto(texto: string): string {
  const t = normalizeStr(texto)
    .replace(/hermosilla[^\n]{0,60}madrid/g, " ")
    .replace(/banco santander|santander consumer/g, " ");
  let mejor: { pos: number; provincia: string } | null = null;
  for (const x of LISTA) {
    const m = x.re.exec(t);
    if (!m) continue;
    const pos = m.index + m[1].length;
    if (!mejor || pos < mejor.pos) mejor = { pos, provincia: x.provincia };
  }
  return mejor ? mejor.provincia : "";
}
