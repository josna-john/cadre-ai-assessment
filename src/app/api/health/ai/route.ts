import { generateText, Output } from "ai";
import { connection } from "next/server";
import { z } from "zod";
import { MODELS, costUsd, model } from "@/lib/ai";

// End-to-end check that the deployed app can reach the LLM: OpenRouter auth,
// structured output, and latency/usage reporting. Uses the cheapest model
// and a tiny output cap so it is safe to leave public.
export async function GET() {
  // With Cache Components, a GET handler that touches no request data is
  // prerendered at build time. Force request-time execution.
  await connection();

  const started = Date.now();
  try {
    const { output, usage, providerMetadata } = await generateText({
      model: model("fast"),
      maxOutputTokens: 100,
      output: Output.object({
        schema: z.object({ status: z.literal("ok"), echo: z.string() }),
      }),
      prompt: 'Health check. Return status "ok" and echo the word "cadre".',
    });

    return Response.json({
      ok: true,
      model: MODELS.fast,
      latencyMs: Date.now() - started,
      usage,
      costUsd: costUsd(providerMetadata),
      output,
    });
  } catch (err) {
    return Response.json(
      {
        ok: false,
        model: MODELS.fast,
        latencyMs: Date.now() - started,
        error: err instanceof Error ? err.message : String(err),
      },
      { status: 502 },
    );
  }
}
