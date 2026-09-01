-- Manual confirmation for scheduling pages (docs/appointments/AUDITORIA_LINK_AGENDAMENTO_UX.md, §3.3).
-- The host can require reviewing each booking before it's treated as final —
-- the underlying calendar event is still created immediately (so the slot is
-- blocked the same way a confirmed booking blocks it), only bookings.status
-- starts as 'pending' instead of 'confirmed' until the host approves it.

ALTER TYPE booking_status ADD VALUE IF NOT EXISTS 'pending';

ALTER TABLE scheduling_pages
  ADD COLUMN IF NOT EXISTS requires_confirmation boolean NOT NULL DEFAULT false;
