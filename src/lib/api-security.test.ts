import { describe, expect, it } from "vitest";
import { apiHeaders, isTrustedSameOrigin, limitRequest } from "./api-security";

function request(origin: string, client: string) {
  return new Request("https://marketpulse.example/api/translate", {
    headers: { origin, "x-forwarded-for": client },
  });
}

describe("API request guards", () => {
  it("accepts only the API origin", () => {
    expect(isTrustedSameOrigin(request("https://marketpulse.example", "198.51.100.1"))).toBe(true);
    expect(isTrustedSameOrigin(request("https://attacker.example", "198.51.100.1"))).toBe(false);
    expect(
      isTrustedSameOrigin(
        new Request("https://marketpulse.example/api/translate", {
          headers: { "x-forwarded-for": "198.51.100.1" },
        }),
      ),
    ).toBe(false);
  });

  it("throttles excessive requests and returns safe response headers", () => {
    const client = "198.51.100.200";
    const first = limitRequest(request("https://marketpulse.example", client), "test", 2);
    const second = limitRequest(request("https://marketpulse.example", client), "test", 2);
    const third = limitRequest(request("https://marketpulse.example", client), "test", 2);

    expect(first).toMatchObject({ allowed: true, remaining: 1 });
    expect(second).toMatchObject({ allowed: true, remaining: 0 });
    expect(third).toMatchObject({ allowed: false, remaining: 0 });
    expect(apiHeaders(third)).toMatchObject({
      "Cache-Control": "no-store, max-age=0",
      "Retry-After": expect.any(String),
    });
  });
});
