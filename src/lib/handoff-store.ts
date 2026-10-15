import "server-only";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import type { HandoffSubmission } from "./handoff";

// Persistence for handoffs. Server-only: it uses the Supabase secret key,
// which bypasses RLS. The table grants nothing to the public roles (see
// supabase/migrations), so this is the only way in.
//
// In production for a client, this one function is the swap point: replace
// the insert with a call to their CRM (HubSpot, Salesforce) or inbound inbox.

let client: SupabaseClient | undefined;

function db(): SupabaseClient {
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SECRET_KEY;
  if (!url || !key) throw new Error("SUPABASE_URL and SUPABASE_SECRET_KEY must be set");
  client ??= createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });
  return client;
}

export async function saveHandoff(h: Omit<HandoffSubmission, "website">): Promise<{ id: string }> {
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
    })
    .select("id")
    .single();
  if (error) throw new Error(`handoff insert failed: ${error.code} ${error.message}`);
  return { id: data.id as string };
}
