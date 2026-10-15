import type { UIMessageChunk } from "ai";
import { describe, expect, it } from "vitest";
import { TIMEOUT_ERROR, timeoutsAsErrors } from "./chat-stream";

async function run(chunks: UIMessageChunk[]): Promise<UIMessageChunk[]> {
  const out: UIMessageChunk[] = [];
  const reader = timeoutsAsErrors(new ReadableStream({ start: (c) => (chunks.forEach((x) => c.enqueue(x)), c.close()) })).getReader();
  for (let r = await reader.read(); !r.done; r = await reader.read()) out.push(r.value);
  return out;
}

describe("timeoutsAsErrors", () => {
  it("turns a timeout abort into an error the UI shows (not a silent stop)", async () => {
    const out = await run([{ type: "start" }, { type: "abort", reason: "TimeoutError: The operation was aborted due to timeout" }]);
    expect(out).toEqual([{ type: "start" }, { type: "error", errorText: JSON.stringify(TIMEOUT_ERROR) }]);
  });

  it("passes a user Stop through unchanged", async () => {
    const chunks: UIMessageChunk[] = [{ type: "start" }, { type: "abort", reason: "AbortError: This operation was aborted" }];
    expect(await run(chunks)).toEqual(chunks);
  });
});
