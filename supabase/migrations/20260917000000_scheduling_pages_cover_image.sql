-- ============================================================================
-- Scheduling pages — capa personalizada da página pública de agendamento.
-- Additive only. Ver docs/appointments/AUDITORIA_TIMEZONE_CAPA_AGENDAMENTO.md
-- seção 2.
-- ============================================================================

ALTER TABLE scheduling_pages
  ADD COLUMN cover_image_url text;
