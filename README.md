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
  components/              # UI: subida/revisión, detalle, sidebar, fichas técnicas, comparador, cotizador
  login/, page.tsx          # pantalla de login y dashboard principal
lib/
  anthropic.ts             # llamada a la API de Anthropic + prompt de extracción
  db.ts                    # acceso a Supabase (listar/crear/actualizar/borrar)
  auth.ts                  # verificación de contraseña y cookie de sesión
  backup.ts                # payload/dedup del export-import de backup
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
