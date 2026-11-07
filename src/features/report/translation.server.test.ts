import { readFileSync } from "node:fs";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  buildDeepLRequest,
  buildDeepLUrl,
  buildFreeTranslateApiRequest,
  buildLibreTranslateRequest,
  buildMyMemoryUrl,
  decodeDeepLProtectedMarkers,
  encodeDeepLProtectedMarkers,
  translateBatchWithConfiguredProvider,
  translateManyWithDeepL,
  translateWithDeepL,
} from "./translation.server";
import { resetTranslationMemoryForTests } from "./translation-memory.server";

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("LibreTranslate server adapter", () => {
  it("builds the documented form request and keeps the API key optional", () => {
    const request = buildLibreTranslateRequest({
      text: "EUR/USD is above QXSECRETTOKENAQX.",
      sourceLocale: "en",
      targetLocale: "es",
      terminology: [],
    });
    const params = new URLSearchParams(request.body);

    expect(request.headers["content-type"]).toBe("application/x-www-form-urlencoded");
    expect(params.get("q")).toContain("EUR/USD");
    expect(params.get("source")).toBe("en");
    expect(params.get("target")).toBe("es");
    expect(params.get("format")).toBe("text");
    expect(params.has("api_key")).toBe(false);
  });

  it("only adds a server-side API key when configured", () => {
    const request = buildLibreTranslateRequest(
      {
        text: "Hello",
        sourceLocale: "en",
        targetLocale: "ar",
        terminology: [],
      },
      "server-only-key",
    );

    expect(new URLSearchParams(request.body).get("api_key")).toBe("server-only-key");
  });

  it("builds the opt-in free-hosted MyMemory request without exposing credentials in the browser", () => {
    const url = new URL(
      buildMyMemoryUrl(
        {
          text: "EUR/USD is above QXSECRETTOKENAQX.",
          sourceLocale: "en",
          targetLocale: "ar",
          terminology: [],
        },
        "https://api.mymemory.translated.net/get",
        "qa@example.com",
      ),
    );

    expect(url.searchParams.get("q")).toContain("EUR/USD");
    expect(url.searchParams.get("langpair")).toBe("en|ar");
    expect(url.searchParams.get("de")).toBe("qa@example.com");
  });
});

describe("Free Translate API server adapter", () => {
  it("uses its JSON target-only contract without putting configuration in the browser", () => {
    const request = buildFreeTranslateApiRequest({
      text: "EUR/USD is above QXSECRETTOKENAQX.",
      sourceLocale: "en",
      targetLocale: "ar",
      terminology: [],
    });

    expect(request.headers["content-type"]).toBe("application/json");
    expect(JSON.parse(request.body)).toEqual({
      text: "EUR/USD is above QXSECRETTOKENAQX.",
      to: "ar",
    });
  });
});

describe("DeepL server adapter", () => {
  const request = {
    text: "EUR/USD is above QXSECRETTOKENAQX.",
    sourceLocale: "en" as const,
    targetLocale: "es" as const,
    terminology: [],
  };

  it("uses the documented host, v2 path, authorization header, and Spanish language mapping", () => {
    const prepared = buildDeepLRequest(request, "server-only-key");

    expect(buildDeepLUrl("https://api-free.deepl.com/")).toBe(
      "https://api-free.deepl.com/v2/translate",
    );
    expect(buildDeepLUrl("https://api-free.deepl.com/v2/translate")).toBe(
      "https://api-free.deepl.com/v2/translate",
    );
    expect(prepared.headers["authorization"]).toBe("DeepL-Auth-Key server-only-key");
    expect(prepared.headers["content-type"]).toBe("application/json");
    expect(JSON.parse(prepared.body)).toEqual({
      text: ["EUR/USD is above <mt-protected>QXSECRETTOKENAQX</mt-protected>."],
      source_lang: "EN",
      target_lang: "ES",
      tag_handling: "xml",
      ignore_tags: ["mt-protected"],
    });
  });

  it("uses ignored XML content for protected markers and restores the shared marker form", () => {
    const encoded = encodeDeepLProtectedMarkers("QXSECRETTOKENAQX / QXSECRETTOKENBQX");
    expect(encoded).toBe(
      "<mt-protected>QXSECRETTOKENAQX</mt-protected> / <mt-protected>QXSECRETTOKENBQX</mt-protected>",
    );
    expect(decodeDeepLProtectedMarkers(encoded)).toBe("QXSECRETTOKENAQX / QXSECRETTOKENBQX");
  });

  it("escapes XML-sensitive market copy before using DeepL XML tag handling", () => {
    const prepared = buildDeepLRequest(
      { ...request, text: "S&P 500 < 7,400 & EUR/USD is QXSECRETTOKENAQX" },
      "server-only-key",
    );

    expect(JSON.parse(prepared.body).text).toEqual([
      "S&amp;P 500 &lt; 7,400 &amp; EUR/USD is <mt-protected>QXSECRETTOKENAQX</mt-protected>",
    ]);
  });

  it("maps Arabic to AR and keeps credentials out of VITE client configuration", () => {
    const prepared = buildDeepLRequest({ ...request, targetLocale: "ar" }, "server-only-key");
    const serverAdapterSource = readFileSync(
      resolve(process.cwd(), "src/features/report/translation.server.ts"),
      "utf8",
    );

    expect(JSON.parse(prepared.body).target_lang).toBe("AR");
    expect(serverAdapterSource).not.toContain("VITE_");
  });

  it("parses a valid DeepL response", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({
          translations: [
            {
              detected_source_language: "EN",
              text: "<mt-protected>QXSECRETTOKENAQX</mt-protected> traducido",
            },
          ],
        }),
      }),
    );

    await expect(
      translateWithDeepL(request, "https://api-free.deepl.com", "server-only-key"),
    ).resolves.toEqual({
      ok: true,
      provider: "deepl",
      text: "QXSECRETTOKENAQX traducido",
    });
  });

  it("returns clear malformed, HTTP, and quota errors", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: true, json: async () => ({}) }));
    await expect(
      translateWithDeepL(request, "https://api-free.deepl.com", "key"),
    ).resolves.toMatchObject({
      ok: false,
      provider: "deepl",
      reason: "DeepL returned a malformed translation response.",
    });

    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: false, status: 456 }));
    await expect(
      translateWithDeepL(request, "https://api-free.deepl.com", "key"),
    ).resolves.toMatchObject({
      ok: false,
      provider: "deepl",
      reason: "DeepL character quota has been reached.",
    });
  });

  it("rejects a DeepL response that changed a protected financial marker", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({ translations: [{ text: "EUR/USD is above changed token." }] }),
      }),
    );

    await expect(
      translateWithDeepL(request, "https://api-free.deepl.com", "key"),
    ).resolves.toMatchObject({
      ok: false,
      provider: "deepl",
      reason: "DeepL changed protected financial values; the text was not cached.",
    });
  });

  it("batches multiple texts into one DeepL request", async () => {
    const { translateManyWithDeepL } = await import("./translation.server");
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        translations: [
          { text: "Uno <mt-protected>QXSECRETTOKENAQX</mt-protected>" },
          { text: "Dos" },
        ],
      }),
    });
    vi.stubGlobal("fetch", fetchMock);

    await expect(
      translateManyWithDeepL(
        [request, { ...request, text: "Second text" }],
        "https://api-free.deepl.com",
        "server-only-key",
      ),
    ).resolves.toEqual([
      { ok: true, provider: "deepl", text: "Uno QXSECRETTOKENAQX" },
      { ok: true, provider: "deepl", text: "Dos" },
    ]);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(JSON.parse(fetchMock.mock.calls[0]?.[1]?.body).text).toEqual([
      "EUR/USD is above <mt-protected>QXSECRETTOKENAQX</mt-protected>.",
      "Second text",
    ]);
  });

  it("splits a rejected DeepL batch instead of failing every report field", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce({ ok: false, status: 400, text: async () => '{"message":"Request too large"}' })
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          translations: [{ text: "Uno <mt-protected>QXSECRETTOKENAQX</mt-protected>" }],
        }),
      })
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({ translations: [{ text: "Dos" }] }),
      });
    vi.stubGlobal("fetch", fetchMock);

    await expect(
      translateManyWithDeepL(
        [request, { ...request, text: "Second text" }],
        "https://api-free.deepl.com",
        "server-only-key",
      ),
    ).resolves.toEqual([
      { ok: true, provider: "deepl", text: "Uno QXSECRETTOKENAQX" },
      { ok: true, provider: "deepl", text: "Dos" },
    ]);
    expect(fetchMock).toHaveBeenCalledTimes(3);
  });

  it("separates mixed target languages into correct DeepL requests", async () => {
    const fetchMock = vi.fn().mockImplementation(async (_url, init) => {
      const body = JSON.parse(String(init?.body));
      return {
        ok: true,
        json: async () => ({ translations: body.text.map((text: string) => ({ text })) }),
      };
    });
    vi.stubGlobal("fetch", fetchMock);

    await translateManyWithDeepL(
      [request, { ...request, targetLocale: "ar" as const, text: "Second text" }],
      "https://api-free.deepl.com",
      "server-only-key",
    );

    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(fetchMock.mock.calls.map((call) => JSON.parse(call[1]?.body).target_lang).sort()).toEqual([
      "AR",
      "ES",
    ]);
  });

  it("uses language memory before calling DeepL again", async () => {
    const directory = await mkdtemp(join(tmpdir(), "marketpulse-deepl-cache-"));
    const previous = {
      provider: process.env["TRANSLATION_PROVIDER"],
      url: process.env["TRANSLATION_API_URL"],
      key: process.env["TRANSLATION_API_KEY"],
      directory: process.env["TRANSLATION_MEMORY_DIR"],
    };
    process.env["TRANSLATION_PROVIDER"] = "deepl";
    process.env["TRANSLATION_API_URL"] = "https://api-free.deepl.com";
    process.env["TRANSLATION_API_KEY"] = "server-only-key";
    process.env["TRANSLATION_MEMORY_DIR"] = directory;
    resetTranslationMemoryForTests();
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ translations: [{ text: "Perspectiva" }] }),
    });
    vi.stubGlobal("fetch", fetchMock);

    try {
      await translateBatchWithConfiguredProvider([{ ...request, text: "Market outlook" }]);
      await translateBatchWithConfiguredProvider([{ ...request, text: "Market outlook" }]);
      expect(fetchMock).toHaveBeenCalledTimes(1);
      expect(readFileSync(join(directory, "es.json"), "utf8")).toContain("Perspectiva");
    } finally {
      process.env["TRANSLATION_PROVIDER"] = previous.provider;
      process.env["TRANSLATION_API_URL"] = previous.url;
      process.env["TRANSLATION_API_KEY"] = previous.key;
      process.env["TRANSLATION_MEMORY_DIR"] = previous.directory;
      resetTranslationMemoryForTests();
      await rm(directory, { recursive: true, force: true });
    }
  });
});
