-- Tareas de la bandeja "Hoy" de Dársena marcadas como hechas (compartido por todo el equipo).
-- clave = id de la tarea + firma de su contenido: si la tarea cambia (otro recordatorio, otro motivo), vuelve a salir.
create table if not exists public.tareas_hechas (
  clave text primary key,
  hecho timestamptz not null default now(),
  hecho_por text
);
create index if not exists tareas_hechas_hecho on public.tareas_hechas (hecho desc);
alter table public.tareas_hechas enable row level security;
