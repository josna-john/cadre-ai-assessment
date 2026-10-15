// The unit to rate-limit by. IPv6 clients usually control a whole /64, so
// count by that prefix or they could rotate addresses to reset the limit.
export function ipKey(ip: string): string {
  return ip.includes(":") ? ip.split(":").slice(0, 4).join(":") : ip;
}
