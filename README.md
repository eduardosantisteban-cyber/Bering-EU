# Bering EU — Presupuestos

Aplicación web para subir presupuestos de proveedores en PDF, extraer los
datos con IA, y consultarlos/compararlos entre compañeros. Reconstruida como
app real (fuera de Claude.ai) a partir de un artefacto de Claude.ai.

## Stack

- **Frontend/backend**: Next.js 16 (App Router) + Tailwind CSS
- **Base de datos y storage**: Supabase (Postgres + Storage)
- **IA**: API de Anthropic (`claude-sonnet-5`) para extraer datos de los PDF
- **Acceso**: contraseña única compartida por el equipo (sin login individual)
- **Hosting**: Vercel

No hay autenticación individual por usuario: toda la app está protegida por
una única contraseña compartida (variable `APP_PASSWORD`), y todo el acceso a
Supabase pasa por el backend usando la *service role key* — el navegador
nunca habla directamente con Supabase.

## Configuración

### 1. Variables de entorno

Copia `.env.example` a `.env.local` y rellena:

| Variable | Dónde conseguirla |
|---|---|
| `APP_PASSWORD` | La que decidáis como equipo |
| `SESSION_SECRET` | Cadena aleatoria larga, p. ej. `openssl rand -hex 32` |
| `SUPABASE_URL` | Panel de Supabase → Settings → API → Project URL |
| `SUPABASE_SERVICE_ROLE_KEY` | Panel de Supabase → Settings → API → `service_role` (secreta, nunca la publiques) |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Panel de Supabase → Settings → API → `anon` `public` (segura de exponer) |
| `ANTHROPIC_API_KEY` | console.anthropic.com → API Keys |
| `HOLDED_API_KEY` | Panel de Holded → Ajustes → API. Opcional — sin ella, todo funciona igual salvo "Crear presupuesto en Holded" |
| `GOOGLE_SERVICE_ACCOUNT_JSON_BASE64` | Ver "Google Sheet desde el Cotizador" más abajo. Opcional — sin ella, todo funciona igual salvo el botón "Google Sheet" |
| `GOOGLE_DRIVE_FOLDER_ID` | Igual que arriba: ID de vuestra Unidad compartida (o una carpeta dentro) |

`NEXT_PUBLIC_SUPABASE_ANON_KEY` se usa solo para que el navegador suba el
PDF directo a Supabase Storage con un PUT normal a una URL de subida firmada
de un solo uso (así se evita el límite de tamaño de payload de las
funciones de Vercel, ~4.5MB, que un PDF de varias páginas supera
fácilmente). La clave `anon` no da acceso a nada por sí sola: las tablas
están protegidas por RLS sin políticas, y en Storage solo permite completar
una subida que el backend ya autorizó con la service role key.

### 2. Base de datos

Crea un proyecto en [supabase.com](https://supabase.com) y ejecuta, en
orden, las migraciones de `supabase/migrations/` desde el SQL Editor del
panel (o con la CLI de Supabase: `supabase db push`):

- `0001_init.sql` — tablas `presupuestos` / `presupuesto_items` y el bucket
  de Storage `presupuestos-pdfs` para los PDF originales.
- `0002_fichas_tecnicas.sql` — tabla `fichas_tecnicas` y el bucket
  `fichas-tecnicas-pdfs`, para el catálogo de especificaciones de producto
  (ver más abajo).

### 3. Migrar los datos existentes (opcional)

Si tienes un backup exportado desde la versión anterior (botón "Exportar
backup" del artefacto de Claude.ai):

```bash
SUPABASE_URL=... SUPABASE_SERVICE_ROLE_KEY=... node scripts/seed.mjs ruta/al/backup.json
```

El script detecta y omite presupuestos duplicados automáticamente. No migra
copias de los PDF (el backup antiguo no las incluye) — los enlaces de Google
Drive ya guardados se mantienen y siguen funcionando igual.

### 4. Desarrollo local

```bash
npm install
npm run dev
```

Abre [http://localhost:3000](http://localhost:3000).

Tests (lógica pura: normalización de marcas, reparación del JSON de la IA,
cálculo de precios/IVA del cotizador):

```bash
npm run test
```

### 5. Despliegue en Vercel

1. Importa el repositorio en Vercel.
2. Añade las mismas variables de entorno en Project Settings → Environment
   Variables.
3. Despliega — no requiere configuración adicional.

## Fichas técnicas

Catálogo independiente de PDF de especificaciones de producto (no ligado a
ningún presupuesto concreto), pensado para que el equipo comercial pueda
consultarlos y descargarlos. Se abre desde el botón "Fichas técnicas" de la
cabecera:

- Se pueden subir varios PDF a la vez (van directos a Storage, igual que los
  presupuestos).
- Al subir cada PDF, la IA intenta rellenar automáticamente categoría, tipo,
  marca y modelo leyendo el propio documento; si no acierta o se quiere
  reclasificar, hay un botón "IA" para repetirlo, y los campos siempre son
  editables a mano.
- La lista de la izquierda es buscable y filtrable por categoría/marca; al
  seleccionar una ficha se ve su vista previa en PDF a la derecha, sin
  necesidad de descargarla.
- En el **Cotizador**, cada línea añadida se empareja automáticamente (por
  marca + modelo, ver `lib/fichaMatch.ts`) con sus fichas técnicas si
  existen, mostrando un enlace de descarga directa junto a la línea — y un
  botón para descargar de golpe todas las fichas del presupuesto, para
  adjuntarlas al enviárselo al cliente.

## Integración con Holded (CRM)

Envío unidireccional (esta app → Holded, nunca al revés): desde el
Cotizador, con el nombre del cliente y opcionalmente su email, el botón
"Crear presupuesto en Holded" busca o crea el contacto en Holded y crea un
documento tipo `estimate` con las líneas del carrito (nombre, cantidad,
precio de venta con markup ya aplicado).

**Importante**: `lib/holded.ts` se escribió a partir de fragmentos de la
API de Holded encontrados por buscadores, no de la documentación oficial
(developers.holded.com no era accesible desde el entorno donde se
desarrolló, así que tampoco se pudo probar contra una cuenta real). Antes
de confiar en el botón, pruébalo con un presupuesto de prueba y revisa que
el documento se cree bien en Holded — en particular, no quedó claro cómo
se referencia el IVA (probablemente aplica el impuesto por defecto de tu
cuenta; puede que haya que revisarlo/ajustarlo dentro de Holded antes de
mandarlo al cliente). Si algo falla, el mensaje de error del botón
debería incluir la respuesta de Holded — con eso se puede ajustar
`lib/holded.ts` sin tocar el resto de la app.

## Google Sheet desde el Cotizador

Además del botón "Excel" (que genera el archivo en el propio navegador),
hay un botón "Google Sheet" que crea la misma hoja de cálculo — con las
mismas fórmulas de precio de venta/subtotal/IVA/total — directamente en
Google Sheets, dentro de vuestra Unidad compartida de Google Workspace.
Usa una cuenta de servicio, así que nadie del equipo tiene que iniciar
sesión con Google para que funcione:

1. En [console.cloud.google.com](https://console.cloud.google.com), crea
   un proyecto (o usa uno existente) y activa las API **Google Sheets
   API** y **Google Drive API** (Library → busca cada una → Enable).
2. **IAM y administración → Cuentas de servicio → Crear cuenta de
   servicio**. No hace falta darle ningún rol a nivel de proyecto.
3. Abre la cuenta de servicio creada → pestaña **Claves** → **Agregar
   clave → Crear clave nueva → JSON**. Se descarga un archivo `.json`.
4. Copia el `client_email` que aparece dentro de ese JSON (algo como
   `nombre@proyecto.iam.gserviceaccount.com`).
5. En Google Drive, abre vuestra **Unidad compartida** → **Gestionar
   miembros** → añade ese email como miembro, con permiso **Gestor de
   contenido** (o superior) — así es como la cuenta de servicio puede
   crear archivos ahí.
6. Copia el ID de esa Unidad compartida (o de una carpeta dentro): es el
   trozo de la URL después de `/folders/` al abrirla en el navegador.
   Eso va en `GOOGLE_DRIVE_FOLDER_ID`.
7. Codifica el archivo `.json` completo en base64 y pégalo en
   `GOOGLE_SERVICE_ACCOUNT_JSON_BASE64` (en Vercel, como una sola línea
   larga):
   ```bash
   base64 -i ruta/a/tu-cuenta-de-servicio.json | pbcopy   # macOS
   base64 -w0 ruta/a/tu-cuenta-de-servicio.json            # Linux
   ```

Igual que con Holded, `developers.google.com` estaba bloqueado desde el
entorno donde se desarrolló esto, así que tampoco se pudo probar contra
una cuenta real — la diferencia es que la API de Sheets/Drive es mucho
más estable y conocida, y los fragmentos encontrados por buscadores
confirmaron los detalles clave (formato de fórmulas, cómo target-ear la
primera hoja sin conocer su nombre, cómo crear archivos en una Unidad
compartida). Aun así, pruébalo primero con un presupuesto de prueba antes
de usarlo con un cliente real, y si algo falla el mensaje de error debería
incluir la respuesta de Google.

## Estructura del proyecto

```
app/
  api/
    session/            # login/logout con la contraseña compartida
    pdf/upload-url/      # genera la URL firmada para subir un PDF de presupuesto
    extract/             # descarga el PDF ya subido y lo manda a la IA
    presupuestos/         # CRUD de presupuestos (+ /import para restaurar backups)
    pdf/[id]/             # URL firmada para ver el PDF de un presupuesto
    fichas/               # CRUD de fichas técnicas
    fichas/upload-url/    # URL firmada para subir un PDF de ficha técnica
    fichas/extract/       # clasifica una ficha con IA (categoría/tipo/marca/modelo)
    fichas/[id]/download/ # URL firmada para ver/descargar una ficha técnica
    holded/send-estimate/ # crea el contacto y el presupuesto en Holded
    cotizador/google-sheet/ # crea la hoja de Google con las líneas del cotizador
  components/              # UI: subida/revisión, detalle, sidebar, fichas técnicas, comparador, cotizador
  login/, page.tsx          # pantalla de login y dashboard principal
lib/
  anthropic.ts             # llamada a la API de Anthropic + prompt de extracción
  db.ts                    # acceso a Supabase (listar/crear/actualizar/borrar)
  auth.ts                  # verificación de contraseña y cookie de sesión
  backup.ts                # payload/dedup del export-import de backup
  fichaMatch.ts             # empareja líneas del cotizador con fichas técnicas
  holded.ts                 # cliente mínimo de la API de Holded (ver aviso arriba)
  googleSheets.ts            # crea y da formato a la hoja de Google del cotizador
  uploadDirect.ts           # PUT del navegador a una signed upload URL
  supabase/server.ts       # cliente de Supabase del servidor (service role)
supabase/migrations/        # esquema SQL
scripts/seed.mjs            # importación del backup JSON antiguo
proxy.ts                 # protege todas las rutas salvo /login (Next.js 16)
```

## Coste de la IA

Con `claude-sonnet-5`, un presupuesto típico de 1-3 páginas cuesta entre
$0.02 y $0.04 en tokens de la API de Anthropic. Para un volumen de ~100
presupuestos/mes, el coste esperado es de $2-4 al mes. Configura una alerta
de gasto en [console.anthropic.com](https://console.anthropic.com) como red
de seguridad.

Clasificar una ficha técnica con IA es más barato que extraer un presupuesto
(solo pide 4 campos cortos, no una tabla completa): unos $0.01-$0.02 por
ficha, y se paga una sola vez por documento salvo que se pulse "IA" para
reclasificarlo.
