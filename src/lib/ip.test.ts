import { describe, expect, it } from "vitest";
import { ipKey } from "./ip";

describe("ipKey", () => {
  it("keeps IPv4 addresses whole", () => {
    expect(ipKey("203.0.113.7")).toBe("203.0.113.7");
  });

  it("groups IPv6 addresses by /64 so rotating within it doesn't reset the limit", () => {
    expect(ipKey("2001:db8:85a3:1:aaaa::1")).toBe(ipKey("2001:db8:85a3:1:bbbb::2"));
    expect(ipKey("2001:db8:85a3:1::1")).not.toBe(ipKey("2001:db8:85a3:2::1"));
  });
});
