import type { UIMessageChunk } from "ai";

export const TIMEOUT_ERROR = {
  error: "timeout",
  message: "That took too long to answer. Please try again.",
};

// When streamText's timeout fires, the UI stream ends with an `abort` chunk.
// useChat treats that exactly like the visitor pressing Stop: no error, and a
// blank or half-finished reply. Turn timeout aborts into an error chunk (same
// JSON shape as our HTTP errors) so the UI shows a retryable error instead.
// A real Stop is left alone; the client that sent it has already gone.
export function timeoutsAsErrors(stream: ReadableStream<UIMessageChunk>): ReadableStream<UIMessageChunk> {
  return stream.pipeThrough(
    new TransformStream<UIMessageChunk, UIMessageChunk>({
      transform(chunk, controller) {
        if (chunk.type === "abort" && /timeout/i.test(chunk.reason ?? "")) {
          controller.enqueue({ type: "error", errorText: JSON.stringify(TIMEOUT_ERROR) });
          return;
        }
        controller.enqueue(chunk);
      },
    }),
  );
}
