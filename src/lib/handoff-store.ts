import "server-only";
import { createHmac } from "node:crypto";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import type { HandoffSubmission } from "./handoff";
import { ipKey } from "./ip";

// Persistence for handoffs. Server-only: it uses the Supabase secret key,
// which bypasses RLS. The table grants nothing to the public roles (see
// supabase/migrations), so this is the only way in.
//
// In production for a client, this one function is the swap point: replace
// the insert with a call to their CRM (HubSpot, Salesforce) or inbound inbox.

// The firewall allows 20 POSTs a minute per IP across all of /api (one rule on
// this plan; see D8). Handoffs need a tighter cap so one client can't fill the
// table.
export const HANDOFF_RATE_LIMIT = { max: 5, windowMs: 10 * 60_000 };

export class HandoffRateLimitedError extends Error {
  constructor() {
    super("handoff rate limit exceeded");
  }
}

let client: SupabaseClient | undefined;

function env() {
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SECRET_KEY;
  if (!url || !key) throw new Error("SUPABASE_URL and SUPABASE_SECRET_KEY must be set");
  return { url, key };
}

function db(): SupabaseClient {
  const { url, key } = env();
  client ??= createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });
  return client;
}

// Keyed so the stored value can't be reversed by hashing all IPv4 addresses.
function hashIp(ip: string): string {
  return createHmac("sha256", env().key).update(ipKey(ip)).digest("hex").slice(0, 32);
}

export async function saveHandoff(
  h: Omit<HandoffSubmission, "website">,
  { ip }: { ip?: string } = {},
): Promise<{ id: string }> {
  // Vercel always sets the client IP (and overwrites any spoofed
  // x-forwarded-for), so a missing IP only happens off-platform, e.g. in tests.
  // The check is count-then-insert, so a parallel burst can slip a few rows
  // past the cap. It's still bounded by the firewall's 20/min (D8).
  const ipHash = ip ? hashIp(ip) : null;

  if (ipHash) {
    const since = new Date(Date.now() - HANDOFF_RATE_LIMIT.windowMs).toISOString();
    const { count, error } = await db()
      .from("handoffs")
      .select("id", { count: "exact", head: true })
      .eq("ip_hash", ipHash)
      .gte("created_at", since);
    if (error) throw new Error(`handoff rate check failed: ${error.code} ${error.message}`);
    if ((count ?? 0) >= HANDOFF_RATE_LIMIT.max) throw new HandoffRateLimitedError();
  }

  const { data, error } = await db()
    .from("handoffs")
    .insert({
      topic: h.topic,
      summary: h.summary,
      name: h.name,
      email: h.email,
      company: h.company ?? null,
      note: h.note ?? null,
      transcript: h.transcript,
      ip_hash: ipHash,
    })
    .select("id")
    .single();
  if (error) throw new Error(`handoff insert failed: ${error.code} ${error.message}`);
  return { id: data.id as string };
}
