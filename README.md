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
| `ANTHROPIC_API_KEY` | console.anthropic.com → API Keys |

### 2. Base de datos

Crea un proyecto en [supabase.com](https://supabase.com) y ejecuta la
migración `supabase/migrations/0001_init.sql` desde el SQL Editor del panel
(o con la CLI de Supabase: `supabase db push`). Crea las tablas
`presupuestos` / `presupuesto_items` y el bucket de Storage
`presupuestos-pdfs` para los PDF originales.

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

### 5. Despliegue en Vercel

1. Importa el repositorio en Vercel.
2. Añade las mismas variables de entorno en Project Settings → Environment
   Variables.
3. Despliega — no requiere configuración adicional.

## Estructura del proyecto

```
app/
  api/
    session/       # login/logout con la contraseña compartida
    extract/        # sube un PDF a la IA y devuelve los datos extraídos
    presupuestos/    # CRUD de presupuestos
    pdf/[id]/        # URL firmada para ver el PDF guardado en Storage
  components/        # UI: subida/revisión, detalle, comparador, cotizador
  login/, page.tsx    # pantalla de login y dashboard principal
lib/
  anthropic.ts       # llamada a la API de Anthropic + prompt de extracción
  db.ts              # acceso a Supabase (listar/crear/actualizar/borrar)
  auth.ts            # verificación de contraseña y cookie de sesión
supabase/migrations/  # esquema SQL
scripts/seed.mjs      # importación del backup JSON antiguo
proxy.ts               # protege todas las rutas salvo /login (Next.js 16)
```

## Coste de la IA

Con `claude-sonnet-5`, un presupuesto típico de 1-3 páginas cuesta entre
$0.02 y $0.04 en tokens de la API de Anthropic. Para un volumen de ~100
presupuestos/mes, el coste esperado es de $2-4 al mes. Configura una alerta
de gasto en [console.anthropic.com](https://console.anthropic.com) como red
de seguridad.
