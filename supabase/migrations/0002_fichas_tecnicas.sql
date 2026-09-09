-- Fichas técnicas: catálogo de PDFs de especificaciones de producto,
-- independiente de los presupuestos, para que el equipo comercial pueda
-- consultarlas y descargarlas por categoría/tipo/marca/modelo.

create table if not exists fichas_tecnicas (
  id              text primary key,
  categoria       text not null default '',
  tipo_producto   text,
  marca           text,
  modelo          text,
  nombre_archivo  text not null,
  storage_path    text not null,
  notas           text,
  created_at      timestamptz not null default now()
);

create index if not exists idx_fichas_categoria on fichas_tecnicas (categoria);
create index if not exists idx_fichas_marca on fichas_tecnicas (marca);
create index if not exists idx_fichas_tipo on fichas_tecnicas (tipo_producto);

-- Mismo modelo de acceso que el resto de tablas: RLS activado sin
-- políticas, solo la service role key (backend) puede leer/escribir.
alter table fichas_tecnicas enable row level security;

-- Bucket de Storage dedicado para los PDF de fichas técnicas.
insert into storage.buckets (id, name, public)
values ('fichas-tecnicas-pdfs', 'fichas-tecnicas-pdfs', false)
on conflict (id) do nothing;
