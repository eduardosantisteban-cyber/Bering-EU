-- Fichas técnicas: fecha y versión del propio documento (las lee la IA del PDF), para quedarse
-- siempre con la más reciente cuando hay varias del mismo producto.
alter table fichas_tecnicas add column if not exists fecha_documento date;
alter table fichas_tecnicas add column if not exists version text;
