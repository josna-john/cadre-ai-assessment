-- The handoff form now collects what Cadre's own contact form requires (first
-- and last name, company, work email, optional phone), so each handoff is a
-- complete lead for the CRM.
--
-- Additive only: the new columns are nullable and `name` keeps the full name,
-- so code deployed before this migration (or rows written before it) still
-- works. The app enforces the required fields (src/lib/handoff.ts).

alter table public.handoffs
  add column first_name text check (char_length(first_name) between 1 and 50),
  add column last_name text check (char_length(last_name) between 1 and 50),
  add column phone text check (char_length(phone) <= 40);

-- `name` now holds "first last": up to 50 + 1 + 50 characters.
alter table public.handoffs drop constraint handoffs_name_check;
alter table public.handoffs add constraint handoffs_name_check check (char_length(name) between 1 and 101);
