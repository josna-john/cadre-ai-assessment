-- Escalations the chatbot couldn't answer, submitted by the visitor through the
-- in-chat handoff form (see src/lib/handoff.ts). This table stands in for the
-- CRM a production deployment would write to.

create table public.handoffs (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  status text not null default 'new'
    check (status in ('new', 'contacted', 'closed')),
  -- Routing key, chosen by the model from a fixed enum. Keep in sync with
  -- HANDOFF_TOPICS in src/lib/handoff.ts.
  topic text not null
    check (topic in ('pricing', 'security_compliance', 'portal_access', 'account_specific', 'partnership_legal', 'other')),
  summary text not null check (char_length(summary) between 1 and 300),
  name text not null check (char_length(name) between 1 and 100),
  email text not null check (char_length(email) between 3 and 254),
  company text check (char_length(company) <= 200),
  note text check (char_length(note) <= 1000),
  -- The last few turns of the conversation, as [{ role, text }].
  transcript jsonb not null default '[]'::jsonb
);

-- The triage view: newest open handoffs first.
create index handoffs_status_created_at_idx on public.handoffs (status, created_at desc);

-- Contact details are PII. Only the server (secret key, which bypasses RLS)
-- reads or writes this table. RLS is on with no policies, and the public API
-- roles have no grants, so the publishable key can't touch it.
alter table public.handoffs enable row level security;
revoke all on table public.handoffs from anon, authenticated;
