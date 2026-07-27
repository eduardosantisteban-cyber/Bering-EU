-- Esquema inicial: base de datos de presupuestos de proveedores.
-- No hay autenticación individual por usuario (acceso mediante
-- contraseña compartida a nivel de app), así que todo el acceso a
-- estas tablas pasa por el backend con la service role key.

create table if not exists presupuestos (
  id                text primary key,
  proveedor         text not null,
  numero_presupuesto text,
  fecha_presupuesto  date,
  pdf_filename      text,
  drive_url         text,
  pdf_storage_path  text,
  uploaded_at       timestamptz not null default now(),
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now()
);

create table if not exists presupuesto_items (
  id              text primary key,
  presupuesto_id  text not null references presupuestos(id) on delete cascade,
  codigo_articulo text,
  categoria       text not null default '',
  tipo_producto   text,
  marca           text,
  modelo          text,
  medidas         text,
  precio_unitario numeric(12,2),
  moneda          text default 'EUR',
  cantidad        numeric(12,2) not null default 1,
  es_accesorio    boolean not null default false,
  grupo           integer not null default 1,
  notas           text
);

create index if not exists idx_items_presupuesto on presupuesto_items (presupuesto_id);
create index if not exists idx_items_categoria on presupuesto_items (categoria);
create index if not exists idx_items_marca on presupuesto_items (marca);
create index if not exists idx_items_tipo on presupuesto_items (tipo_producto);
create index if not exists idx_presupuestos_fecha on presupuestos (fecha_presupuesto desc);

-- Mantiene updated_at al día en cada modificación del presupuesto.
create or replace function set_updated_at()
returns trigger as $$
begin
  new.updated_at = now();
  return new;
end;
$$ language plpgsql;

drop trigger if exists trg_presupuestos_updated_at on presupuestos;
create trigger trg_presupuestos_updated_at
  before update on presupuestos
  for each row execute function set_updated_at();

-- RLS activado sin políticas: solo la service role key (que la
-- traspasa) puede leer/escribir. El navegador nunca tiene acceso
-- directo a Supabase con la anon key.
alter table presupuestos enable row level security;
alter table presupuesto_items enable row level security;

-- Bucket de Storage para copias de los PDF originales.
insert into storage.buckets (id, name, public)
values ('presupuestos-pdfs', 'presupuestos-pdfs', false)
on conflict (id) do nothing;
