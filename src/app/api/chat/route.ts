import { createUIMessageStreamResponse, toUIMessageStream } from "ai";
import { MODELS } from "@/lib/ai";
import { streamChat } from "@/lib/chat";
import { parseChatRequest } from "@/lib/chat-request";
import { logEvent } from "@/lib/log";

const INVALID = { error: "invalid_request", message: "That request wasn't understood. Please refresh and try again." };

// Flow: validate → cap → stream (src/lib/chat.ts) → log.
export async function POST(req: Request) {
  const startedAt = Date.now();

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    logEvent("chat.rejected", { reason: "invalid_json" });
    return Response.json(INVALID, { status: 400 });
  }

  const parsed = parseChatRequest(body);
  if (!parsed.ok) {
    logEvent("chat.rejected", { reason: parsed.error });
    return Response.json({ error: parsed.error, message: parsed.message }, { status: parsed.status });
  }

  let result;
  try {
    result = await streamChat(parsed.messages, { abortSignal: req.signal, startedAt });
  } catch (error) {
    // History the SDK can't convert (stale or tampered client state).
    logEvent("chat.rejected", { reason: "unconvertible_history", error: String(error) });
    return Response.json(INVALID, { status: 400 });
  }

  return createUIMessageStreamResponse({
    stream: toUIMessageStream({
      stream: result.stream,
      // Errors after streaming starts can't change the HTTP status, so they go
      // out as a stream error part. Log the detail, and send the user a safe
      // message in the same JSON shape as HTTP errors so the UI can show it.
      onError: (error) => {
        logEvent("chat.error", {
          model: MODELS.chat,
          latencyMs: Date.now() - startedAt,
          error: error instanceof Error ? `${error.name}: ${error.message}` : String(error),
        });
        return JSON.stringify({
          error: "stream_error",
          message: "Sorry, I couldn't finish that answer. Please try again.",
        });
      },
    }),
  });
}
