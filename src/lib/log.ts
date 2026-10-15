// One structured JSON line per event, so Vercel logs can be filtered and
// aggregated (latency, tokens and cost per turn) without a logging vendor.
export function logEvent(event: string, fields: Record<string, unknown>): void {
  console.log(JSON.stringify({ event, at: new Date().toISOString(), ...fields }));
}
