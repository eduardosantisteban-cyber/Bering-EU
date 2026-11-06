-- Referencias web («Ref. W-XXXXXX») que el script de GTM de beringeu.es añade a los mensajes de WhatsApp y email.
-- Guardan el clic del anuncio (gclid/gbraid/wbraid), la página de entrada y la campaña, para enlazar la
-- oportunidad con Google Ads aunque el cliente no use el formulario.
-- Escribe el endpoint público /api/web-ref (solo desde beringeu.es) y lee/vincula el portal (service role):
-- RLS activado y sin políticas.

create table if not exists public.web_refs (
  ref text primary key check (ref ~ '^W-[A-Z2-9]{6}$'),
  creado timestamptz not null default now(),
  actualizado timestamptz not null default now(),
  canal text not null check (canal in ('whatsapp', 'email')),
  gclid text,
  gbraid text,
  wbraid text,
  pagina text,          -- página desde la que hizo clic
  landing text,         -- primera página de la visita (la del anuncio)
  utm_source text,
  utm_medium text,
  utm_campaign text,
  utm_term text,
  oportunidad text,     -- BEUQ### / MMQ### vinculada
  vinculado timestamptz,
  enviado_hoja timestamptz  -- cuándo se pasó el gclid a la pestaña GCLID de la hoja de marketing
);
create index if not exists web_refs_oportunidad on public.web_refs (oportunidad);
alter table public.web_refs enable row level security;

-- Marca de la última ejecución de tareas periódicas que se lanzan aprovechando otras peticiones
-- (p. ej. la vinculación de referencias web cada hora). Solo la usa el portal (service role).
create table if not exists public.tareas (
  nombre text primary key,
  ultima timestamptz not null default '1970-01-01',
  resultado jsonb
);
alter table public.tareas enable row level security;
