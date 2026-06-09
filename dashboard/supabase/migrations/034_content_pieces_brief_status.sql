-- 034_content_pieces_brief_status.sql
--
-- Asistente Creativo refactor: el agente (antes content-creator) ahora genera
-- BRIEFS, no piezas producidas. Una pieza arranca con status 'brief' y el equipo
-- humano (CM + editor) la mueve a 'produced'/'published' manualmente.
--
-- El CHECK previo no incluía 'brief', así que el INSERT de registerContentPiece
-- violaba el constraint (fallaba silencioso por el try/catch non-fatal del agente).
-- Agregamos 'brief' a los valores permitidos y lo dejamos como default.

alter table content_pieces drop constraint if exists content_pieces_status_check;

alter table content_pieces
  add constraint content_pieces_status_check
  check (status in ('brief', 'draft', 'produced', 'published', 'archived'));

alter table content_pieces alter column status set default 'brief';
