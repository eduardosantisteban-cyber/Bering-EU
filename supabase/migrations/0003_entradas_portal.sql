-- Oportunidades que llegan por llamada o WhatsApp (registradas en el portal) y llamadas entrantes de VoIPstudio.
-- Solo las usa el servidor del portal (service role): RLS activado y sin políticas = nadie más puede leerlas.

create table if not exists public.entradas_oportunidad (
  id uuid primary key default gen_random_uuid(),
  creado timestamptz not null default now(),
  canal text not null,                       -- Llamada · WhatsApp · Presencial / otro
  registrado_por text not null,              -- cuenta de Gmail cuyo script la crea (marca = la de esa cuenta)
  empresa text not null,
  contacto text,
  email text,
  telefono text,
  nota text not null,                        -- lo que pide el cliente (texto pegado del chat o resumen de la llamada)
  llamada_id uuid,                           -- si se registra desde una llamada de VoIPstudio
  estado text not null default 'pendiente',  -- pendiente · procesando · creada · error
  reclamado timestamptz,
  codigo text,                               -- BEUQxxx / MMQxxx cuando el script la crea
  error text
);
create index if not exists entradas_oportunidad_estado on public.entradas_oportunidad (estado, registrado_por);
alter table public.entradas_oportunidad enable row level security;

create table if not exists public.llamadas_entrantes (
  id uuid primary key default gen_random_uuid(),
  creado timestamptz not null default now(),
  call_id text unique not null,
  numero text not null,                      -- quien llama
  destino text,                              -- número o extensión de Bering que recibe la llamada
  duracion integer,                          -- segundos
  perdida boolean not null default false,
  comercial text,                            -- a quién se avisa
  cliente text,                              -- nombre del contacto de Holded si el número ya es cliente
  estado text not null default 'nueva',      -- nueva · avisada · cliente · registrada · descartada
  codigo text
);
create index if not exists llamadas_entrantes_estado on public.llamadas_entrantes (estado, creado desc);
alter table public.llamadas_entrantes enable row level security;
