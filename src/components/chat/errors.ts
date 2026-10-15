// Turns useChat's `error` into a message that is safe to show a visitor.
//
// For non-2xx responses the AI SDK throws an APICallError whose `message` is
// the raw response body, so our route's `{ error, message }` JSON arrives as a
// string. Anything we can't parse (network failures, mid-stream errors) gets a
// generic line so server internals never leak into the UI.

const GENERIC = "Something went wrong while getting a reply.";

type ErrorBody = { error?: unknown; message?: unknown };

function parseBody(raw: unknown): ErrorBody | null {
  if (typeof raw !== "string" || !raw.trim().startsWith("{")) return null;
  try {
    const parsed: unknown = JSON.parse(raw);
    return parsed && typeof parsed === "object" ? (parsed as ErrorBody) : null;
  } catch {
    return null;
  }
}

export function friendlyErrorMessage(error: Error): string {
  const withBody = error as Error & { responseBody?: unknown };
  const body = parseBody(withBody.responseBody) ?? parseBody(error.message);
  if (body && typeof body.message === "string" && body.message.trim()) {
    return body.message;
  }
  return GENERIC;
}
