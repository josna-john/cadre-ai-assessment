-- "Talk to an AI strategist" now opens the chat's own lead form instead of
-- linking to cadre.ai/contact (D19), so strategist requests get their own
-- routing topic. The list must match HANDOFF_TOPICS in src/lib/handoff.ts
-- (a unit test asserts it against the latest migration).
--
-- Additive: every existing topic is still allowed, so rows and code from
-- before this migration keep working.

alter table public.handoffs drop constraint handoffs_topic_check;
alter table public.handoffs add constraint handoffs_topic_check
  check (topic in ('pricing', 'security_compliance', 'portal_access', 'account_specific', 'partnership_legal', 'other', 'strategy_call'));
