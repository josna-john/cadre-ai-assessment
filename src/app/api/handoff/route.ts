import { HANDOFF_FORM_FIELDS, handoffSubmissionSchema } from "@/lib/handoff";
import { HandoffRateLimitedError, saveHandoff } from "@/lib/handoff-store";
import { logEvent } from "@/lib/log";

// A valid submission is at most about 22 KB (10 transcript turns of 2,000
// chars plus the fields). Refuse anything far larger before parsing it.
const MAX_BODY_BYTES = 32_000;

// Field-level problems get a 400 the form can highlight. Anything else is a
// request the visitor can't fix by retyping, so the form offers email instead.
const UNAVAILABLE = { error: "handoff_unavailable", message: "We couldn't send that just now." };

// Vercel sets x-forwarded-for; the first entry is the client.
function clientIp(req: Request): string | undefined {
  return req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || req.headers.get("x-real-ip") || undefined;
}

// The visitor submitted the in-chat handoff form. No LLM involved: validate,
// save, log. Logs carry the id and topic only, never contact details.
export async function POST(req: Request) {
  if (Number(req.headers.get("content-length") ?? 0) > MAX_BODY_BYTES) {
    logEvent("handoff.rejected", { reason: "too_large" });
    return Response.json(UNAVAILABLE, { status: 413 });
  }

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    logEvent("handoff.rejected", { reason: "invalid_json" });
    return Response.json(UNAVAILABLE, { status: 400 });
  }

  const parsed = handoffSubmissionSchema.safeParse(body);
  if (!parsed.success) {
    const fields = parsed.error.issues.map((i) => i.path.join("."));
    logEvent("handoff.rejected", { reason: "validation", fields });

    const fieldErrors: Record<string, string> = {};
    for (const issue of parsed.error.issues) {
      const field = String(issue.path[0]);
      if ((HANDOFF_FORM_FIELDS as readonly string[]).includes(field)) fieldErrors[field] ??= issue.message;
    }
    if (Object.keys(fieldErrors).length < new Set(parsed.error.issues.map((i) => String(i.path[0]))).size) {
      return Response.json(UNAVAILABLE, { status: 422 });
    }
    return Response.json(
      { error: "invalid_handoff", message: "Please check the highlighted fields.", fieldErrors },
      { status: 400 },
    );
  }

  const { website, ...handoff } = parsed.data;
  if (website) {
    // Honeypot tripped: look successful to the bot, save nothing.
    logEvent("handoff.rejected", { reason: "honeypot" });
    return Response.json({ ok: true }, { status: 201 });
  }

  try {
    const { id } = await saveHandoff(handoff, { ip: clientIp(req) });
    logEvent("handoff.created", { id, topic: handoff.topic, transcriptTurns: handoff.transcript.length });
    return Response.json({ ok: true }, { status: 201 });
  } catch (error) {
    if (error instanceof HandoffRateLimitedError) {
      logEvent("handoff.rejected", { reason: "rate_limited" });
      return Response.json(
        { error: "rate_limited", message: "You've sent several requests already. Please email the team instead." },
        { status: 429 },
      );
    }
    logEvent("handoff.error", { topic: handoff.topic, error: String(error) });
    return Response.json(UNAVAILABLE, { status: 503 });
  }
}
