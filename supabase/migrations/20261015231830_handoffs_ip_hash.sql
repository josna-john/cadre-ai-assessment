-- Per-visitor rate limit for handoff submissions (src/lib/handoff-store.ts).
-- Stores a keyed HMAC of the client IP, never the IP itself, so rows can be
-- counted per visitor without keeping a raw address.
alter table public.handoffs add column ip_hash text;

create index handoffs_ip_hash_created_at_idx on public.handoffs (ip_hash, created_at desc);
