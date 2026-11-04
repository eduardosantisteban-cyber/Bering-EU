-- Finanzas de gestión (agente CFO). Cada fila es un documento leído de la carpeta de la gestoría en Drive
-- («Facturas / Bering ES Zoom / MM-YYYY») o de Gmail. Las nóminas entran solo como total mensual de coste de personal.
-- Solo las usa el servidor del portal (service role) y el agente CFO: RLS activado y sin políticas.

create table if not exists public.fin_documentos (
  id uuid primary key default gen_random_uuid(),
  creado timestamptz not null default now(),
  actualizado timestamptz not null default now(),
  sociedad text not null default 'Bering ES',     -- Bering ES · Bering LU
  tipo text not null check (tipo in ('venta', 'cogs', 'fijo', 'variable', 'personal', 'grupo')),
  categoria text,                                 -- p. ej. Software, Telefonía, Coworking, Combustible, Desplazamientos, Nóminas
  contraparte text not null,                      -- proveedor o cliente
  numero text not null,                           -- nº de factura (o «ticket <fecha>», «nómina 2026-10»)
  fecha date not null,                            -- fecha de la factura
  mes text not null,                              -- YYYY-MM al que se imputa (el de la fecha de la factura)
  base numeric(12,2),                             -- base imponible en EUR (null si no consta)
  iva numeric(12,2),
  total numeric(12,2),
  moneda text not null default 'EUR',
  isp boolean not null default false,             -- inversión del sujeto pasivo (Google, Anthropic…)
  ticket boolean not null default false,          -- ticket/recibo, no factura completa (Uber…)
  beuq text,                                      -- proyecto (BEUQ###) al que se imputa la venta o el COGS
  hito text,                                      -- anticipo · entrega · final · único
  vencimiento date,
  pagado boolean,                                 -- null = sin comprobar
  drive_id text,                                  -- id del PDF en Drive
  notas text,
  unique (sociedad, tipo, contraparte, numero)
);
create index if not exists fin_documentos_mes on public.fin_documentos (mes, tipo);
create index if not exists fin_documentos_beuq on public.fin_documentos (beuq);
alter table public.fin_documentos enable row level security;

-- Pendientes y avisos de la revisión mensual (faltantes, duplicados, sin emparejar, COGS pendiente del proveedor…).
create table if not exists public.fin_incidencias (
  id uuid primary key default gen_random_uuid(),
  creado timestamptz not null default now(),
  mes text not null,                              -- YYYY-MM de la revisión en que se detectó
  tipo text not null check (tipo in ('faltante', 'duplicado', 'sin_emparejar', 'cogs_pendiente', 'otra_sociedad', 'ilegible', 'otro')),
  descripcion text not null,
  beuq text,
  importe numeric(12,2),
  drive_id text,
  resuelto boolean not null default false,
  resuelto_en timestamptz,
  clave text unique                               -- para no duplicar el mismo aviso entre revisiones
);
create index if not exists fin_incidencias_abiertas on public.fin_incidencias (resuelto, mes);
alter table public.fin_incidencias enable row level security;
