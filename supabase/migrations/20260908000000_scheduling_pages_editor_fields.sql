-- ============================================================================
-- Scheduling pages — editor v2 fields
-- Additive only: new nullable/defaulted columns, no destructive change.
-- Backs docs/appointments/PLANO_MELHORIAS_FLUXO_CRIACAO_AGENDAMENTO.md section 7
-- (requires_confirmation / pending booking status intentionally deferred —
-- needs the email infra from PLANO_LINK_AGENDAMENTO.md Phase 5 first).
-- ============================================================================

ALTER TABLE scheduling_pages
  ADD COLUMN color text,
  ADD COLUMN calendar_event_title_template text,
  ADD COLUMN cancellation_enabled boolean NOT NULL DEFAULT true,
  ADD COLUMN reschedule_enabled boolean NOT NULL DEFAULT true,
  ADD COLUMN cancellation_min_notice_hours int,
  ADD COLUMN cancellation_reason_required boolean NOT NULL DEFAULT false,
  ADD COLUMN hide_details_on_manage_page boolean NOT NULL DEFAULT false;

ALTER TABLE scheduling_questions
  ADD COLUMN is_hidden boolean NOT NULL DEFAULT false;

ALTER TABLE bookings
  ADD COLUMN cancellation_reason text;
