import { z } from "zod";
import type { TranslationRequest, TranslationResponse } from "./translation";
import { getTranslationMemory, type TranslationMemoryLocale } from "./translation-memory.server";

export const translationRequestSchema = z.object({
  text: z.string().min(1).max(20000),
  sourceLocale: z.literal("en"),
  targetLocale: z.enum(["es", "ar"]),
  terminology: z.array(
    z.object({
      source: z.string().min(1).max(160),
      protected: z.boolean().optional(),
      translations: z
        .object({ es: z.string().max(240).optional(), ar: z.string().max(240).optional() })
        .optional(),
    }),
  ).max(200),
});
export const translationBatchRequestSchema = z.object({
  requests: z.array(translationRequestSchema).min(1).max(50),
}).superRefine(({ requests }, context) => {
  const totalTextLength = requests.reduce((total, request) => total + request.text.length, 0);
  if (totalTextLength > 100_000) {
    context.addIssue({
      code: z.ZodIssueCode.custom,
      message: "Translation batch text is too large.",
      path: ["requests"],
    });
  }
});

type ProviderName =
  | "libretranslate"
  | "free-translate-api"
  | "mymemory"
  | "deepl"
  | "openai-compatible"
  | "benchmark-placeholder";

function env(name: string): string | undefined {
  return typeof process !== "undefined" ? process.env[name] : undefined;
}

async function translateWithOpenAiCompatible(
  request: TranslationRequest,
  apiUrl: string,
  apiKey: string,
  model: string,
): Promise<TranslationResponse> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 15000);
  try {
    const response = await fetch(apiUrl, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        authorization: "Bearer " + apiKey,
      },
      body: JSON.stringify({
        model,
        temperature: 0,
        messages: [
          {
            role: "system",
            content:
              "Translate financial editorial text from English to " +
              request.targetLocale +
              ". Preserve every QXSECRETTOKENAQX token exactly. Do not add, remove, or alter numbers, prices, dates, percentages, or instrument identifiers. Return only the translated text.",
          },
          { role: "user", content: request.text },
        ],
      }),
      signal: controller.signal,
    });
    if (!response.ok) {
      return {
        ok: false,
        provider: "openai-compatible",
        reason: "Translation provider returned HTTP " + response.status + ".",
      };
    }
    const payload = (await response.json()) as {
      choices?: Array<{ message?: { content?: unknown } }>;
    };
    const text = payload.choices?.[0]?.message?.content;
    if (typeof text !== "string" || !text.trim()) {
      return {
        ok: false,
        provider: "openai-compatible",
        reason: "Translation provider returned no text.",
      };
    }
    return { ok: true, text, provider: "openai-compatible" };
  } catch (error) {
    return {
      ok: false,
      provider: "openai-compatible",
      reason:
        error instanceof Error && error.name === "AbortError"
          ? "Translation provider timed out."
          : "Translation provider could not be reached.",
    };
  } finally {
    clearTimeout(timeout);
  }
}

export function buildLibreTranslateRequest(
  request: TranslationRequest,
  apiKey?: string,
): { body: string; headers: Record<string, string> } {
  const body = new URLSearchParams({
    q: request.text,
    source: request.sourceLocale,
    target: request.targetLocale,
    format: "text",
  });
  if (apiKey) body.set("api_key", apiKey);
  return {
    body: body.toString(),
    headers: { "content-type": "application/x-www-form-urlencoded" },
  };
}

async function translateWithLibreTranslate(
  request: TranslationRequest,
  apiUrl: string,
  apiKey?: string,
): Promise<TranslationResponse> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 15000);
  try {
    const prepared = buildLibreTranslateRequest(request, apiKey);
    const response = await fetch(apiUrl, {
      method: "POST",
      headers: prepared.headers,
      body: prepared.body,
      signal: controller.signal,
    });
    if (!response.ok) {
      return {
        ok: false,
        provider: "libretranslate",
        reason: "LibreTranslate returned HTTP " + response.status + ".",
      };
    }
    const payload = (await response.json()) as { translatedText?: unknown; error?: unknown };
    if (typeof payload.translatedText !== "string" || !payload.translatedText.trim()) {
      return {
        ok: false,
        provider: "libretranslate",
        reason:
          typeof payload.error === "string"
            ? "LibreTranslate error: " + payload.error
            : "LibreTranslate returned no translated text.",
      };
    }
    return { ok: true, text: payload.translatedText, provider: "libretranslate" };
  } catch (error) {
    return {
      ok: false,
      provider: "libretranslate",
      reason:
        error instanceof Error && error.name === "AbortError"
          ? "LibreTranslate timed out."
          : "LibreTranslate could not be reached.",
    };
  } finally {
    clearTimeout(timeout);
  }
}

/**
 * https://github.com/ismalzikri/free-translate-api accepts only a target locale;
 * its upstream client auto-detects the source language. Keep this separate from
 * the LibreTranslate adapter rather than pretending their request contracts match.
 */
export function buildFreeTranslateApiRequest(request: TranslationRequest): {
  body: string;
  headers: Record<string, string>;
} {
  return {
    body: JSON.stringify({ text: request.text, to: request.targetLocale }),
    headers: { "content-type": "application/json" },
  };
}

async function translateWithFreeTranslateApi(
  request: TranslationRequest,
  apiUrl: string,
): Promise<TranslationResponse> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 15000);
  try {
    const prepared = buildFreeTranslateApiRequest(request);
    const response = await fetch(apiUrl, {
      method: "POST",
      headers: prepared.headers,
      body: prepared.body,
      signal: controller.signal,
    });
    if (!response.ok) {
      return {
        ok: false,
        provider: "free-translate-api",
        reason: "Free Translate API returned HTTP " + response.status + ".",
      };
    }
    const payload = (await response.json()) as {
      translatedText?: unknown;
      status?: unknown;
      message?: unknown;
    };
    if (
      payload.status !== true ||
      typeof payload.translatedText !== "string" ||
      !payload.translatedText.trim()
    ) {
      return {
        ok: false,
        provider: "free-translate-api",
        reason:
          typeof payload.message === "string" && payload.message
            ? "Free Translate API error: " + payload.message
            : "Free Translate API returned no translated text.",
      };
    }
    return { ok: true, text: payload.translatedText, provider: "free-translate-api" };
  } catch (error) {
    return {
      ok: false,
      provider: "free-translate-api",
      reason:
        error instanceof Error && error.name === "AbortError"
          ? "Free Translate API timed out."
          : "Free Translate API could not be reached.",
    };
  } finally {
    clearTimeout(timeout);
  }
}

export function buildMyMemoryUrl(
  request: TranslationRequest,
  apiUrl: string,
  email?: string,
): string {
  const url = new URL(apiUrl);
  url.searchParams.set("q", request.text);
  url.searchParams.set("langpair", request.sourceLocale + "|" + request.targetLocale);
  if (email) url.searchParams.set("de", email);
  return url.toString();
}

async function translateWithMyMemory(
  request: TranslationRequest,
  apiUrl: string,
  email?: string,
): Promise<TranslationResponse> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 15000);
  try {
    const response = await fetch(buildMyMemoryUrl(request, apiUrl, email), {
      method: "GET",
      headers: { accept: "application/json" },
      signal: controller.signal,
    });
    if (!response.ok) {
      return {
        ok: false,
        provider: "mymemory",
        reason: "MyMemory returned HTTP " + response.status + ".",
      };
    }
    const payload = (await response.json()) as {
      responseData?: { translatedText?: unknown };
      responseStatus?: number;
      responseDetails?: unknown;
    };
    const text = payload.responseData?.translatedText;
    if (typeof text !== "string" || !text.trim()) {
      return {
        ok: false,
        provider: "mymemory",
        reason:
          typeof payload.responseDetails === "string"
            ? "MyMemory error: " + payload.responseDetails
            : "MyMemory returned no translated text.",
      };
    }
    return { ok: true, text, provider: "mymemory" };
  } catch (error) {
    return {
      ok: false,
      provider: "mymemory",
      reason:
        error instanceof Error && error.name === "AbortError"
          ? "MyMemory timed out."
          : "MyMemory could not be reached.",
    };
  } finally {
    clearTimeout(timeout);
  }
}

export function buildDeepLUrl(apiUrl: string): string {
  const baseUrl = apiUrl.replace(/\/+$/, "");
  return /\/v2\/translate$/i.test(baseUrl) ? baseUrl : baseUrl + "/v2/translate";
}

const deepLProtectedMarkerPattern = /QXSECRETTOKEN([A-Z]+)QX/g;
const deepLProtectedTagName = "mt-protected";

// DeepL treats opaque words as ordinary text and may normalize or translate them.
// Send financial placeholders as ignored XML content instead, then return the
// original marker form expected by the shared client-side safety check.
export function encodeDeepLProtectedMarkers(text: string): string {
  return text.replace(
    deepLProtectedMarkerPattern,
    `<${deepLProtectedTagName}>$&</${deepLProtectedTagName}>`,
  );
}

export function decodeDeepLProtectedMarkers(text: string): string {
  return text.replace(
    new RegExp(
      `<${deepLProtectedTagName}(?:\\s[^>]*)?>(QXSECRETTOKEN[A-Z]+QX)<\\/${deepLProtectedTagName}>`,
      "g",
    ),
    "$1",
  );
}

function preservesDeepLProtectedMarkers(source: string, translated: string) {
  const sourceMarkers = source.match(deepLProtectedMarkerPattern) ?? [];
  const translatedMarkers = translated.match(deepLProtectedMarkerPattern) ?? [];
  return (
    sourceMarkers.length === translatedMarkers.length &&
    sourceMarkers.every((marker, index) => marker === translatedMarkers[index])
  );
}

export function buildDeepLRequest(
  request: TranslationRequest,
  apiKey: string,
  texts = [request.text],
): { body: string; headers: Record<string, string> } {
  return {
    body: JSON.stringify({
      text: texts.map(encodeDeepLProtectedMarkers),
      source_lang: "EN",
      target_lang: request.targetLocale === "es" ? "ES" : "AR",
      tag_handling: "xml",
      ignore_tags: [deepLProtectedTagName],
    }),
    headers: {
      authorization: "DeepL-Auth-Key " + apiKey,
      "content-type": "application/json",
    },
  };
}

function retryAfterMilliseconds(response: Response, attempt: number): number {
  const retryAfter = response.headers?.get("retry-after");
  const seconds = retryAfter ? Number(retryAfter) : NaN;
  return Number.isFinite(seconds) && seconds >= 0 ? seconds * 1000 : 500 * 2 ** attempt;
}

async function deepLErrorReason(response: Response): Promise<string> {
  let detail: string | undefined;
  try {
    const body = await response.text();
    const parsed: unknown = JSON.parse(body);
    if (parsed && typeof parsed === "object" && typeof (parsed as { message?: unknown }).message === "string") {
      detail = (parsed as { message: string }).message.replace(/\s+/g, " ").trim().slice(0, 240);
    }
  } catch {
    // Provider error bodies are optional. The status is still safe and useful.
  }
  return detail ? `DeepL rejected this request: ${detail}` : "DeepL returned HTTP " + response.status + ".";
}

export async function translateWithDeepL(
  request: TranslationRequest,
  apiUrl: string,
  apiKey: string,
): Promise<TranslationResponse> {
  const responses = await translateManyWithDeepL([request], apiUrl, apiKey);
  return responses[0] ?? { ok: false, provider: "deepl", reason: "DeepL returned no translation." };
}

export async function translateManyWithDeepL(
  requests: TranslationRequest[],
  apiUrl: string,
  apiKey: string,
): Promise<TranslationResponse[]> {
  if (!requests.length) return [];
  const groups = new Map<TranslationMemoryLocale, Array<{ index: number; request: TranslationRequest }>>();
  requests.forEach((request, index) => {
    const group = groups.get(request.targetLocale) ?? [];
    group.push({ index, request });
    groups.set(request.targetLocale, group);
  });
  if (groups.size > 1) {
    const responses = new Array<TranslationResponse>(requests.length);
    await Promise.all(
      [...groups.values()].map(async (group) => {
        const translated = await translateManyWithDeepL(
          group.map(({ request }) => request),
          apiUrl,
          apiKey,
        );
        group.forEach(({ index }, responseIndex) => {
          responses[index] = translated[responseIndex]!;
        });
      }),
    );
    return responses;
  }
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 15000);
  try {
    const prepared = buildDeepLRequest(
      requests[0]!,
      apiKey,
      requests.map((request) => request.text),
    );
    for (let attempt = 0; attempt < 3; attempt += 1) {
      const response = await fetch(buildDeepLUrl(apiUrl), {
        method: "POST",
        headers: prepared.headers,
        body: prepared.body,
        signal: controller.signal,
      });
      if (response.ok) {
        const payload = (await response.json()) as {
          translations?: Array<{ detected_source_language?: unknown; text?: unknown }>;
        };
        const translations = payload.translations;
        if (!translations || translations.length !== requests.length) {
          return requests.map(() => ({
            ok: false,
            provider: "deepl",
            reason: "DeepL returned a malformed translation response.",
          }));
        }
        return translations.map((translation, index) => {
          if (typeof translation.text !== "string" || !translation.text.trim()) {
            return {
              ok: false,
              provider: "deepl",
              reason: "DeepL returned a malformed translation response.",
            };
          }
          const text = decodeDeepLProtectedMarkers(translation.text);
          return preservesDeepLProtectedMarkers(requests[index]!.text, text)
            ? { ok: true, text, provider: "deepl" }
            : {
                ok: false,
                provider: "deepl",
                reason: "DeepL changed protected financial values; the text was not cached.",
              };
        });
      }
      if ((response.status === 429 || response.status === 529) && attempt < 2) {
        await new Promise((resolve) =>
          setTimeout(resolve, retryAfterMilliseconds(response, attempt)),
        );
        continue;
      }
      // A valid small DeepL request can still be rejected when a report batch
      // crosses an undocumented provider/body boundary. Split only 400 batches;
      // a single rejected field is then reported precisely without discarding
      // translations for the rest of the report.
      if (response.status === 400 && requests.length > 1) {
        const midpoint = Math.ceil(requests.length / 2);
        const [first, second] = await Promise.all([
          translateManyWithDeepL(requests.slice(0, midpoint), apiUrl, apiKey),
          translateManyWithDeepL(requests.slice(midpoint), apiUrl, apiKey),
        ]);
        return [...first, ...second];
      }
      const reason =
        response.status === 429
          ? "DeepL is temporarily rate limiting requests. Please retry shortly."
          : response.status === 456
            ? "DeepL character quota has been reached."
            : await deepLErrorReason(response);
      return requests.map(() => ({ ok: false, provider: "deepl", reason }));
    }
    return requests.map(() => ({
      ok: false,
      provider: "deepl",
      reason: "DeepL is temporarily rate limiting requests. Please retry shortly.",
    }));
  } catch (error) {
    return requests.map(() => ({
      ok: false,
      provider: "deepl",
      reason:
        error instanceof Error && error.name === "AbortError"
          ? "DeepL timed out."
          : "DeepL could not be reached.",
    }));
  } finally {
    clearTimeout(timeout);
  }
}

export async function translateDeepLWithMemory(
  requests: TranslationRequest[],
  apiUrl: string,
  apiKey: string,
): Promise<TranslationResponse[]> {
  const memory = getTranslationMemory();
  const responses = new Array<TranslationResponse>(requests.length);
  const misses = new Map<
    string,
    { locale: TranslationMemoryLocale; request: TranslationRequest; indexes: number[] }
  >();

  await Promise.all(
    requests.map(async (request, index) => {
      const cached = await memory.get(request.targetLocale, request.text);
      if (cached !== undefined) {
        responses[index] = { ok: true, text: cached, provider: "translation-memory" };
        return;
      }
      const key = `${request.targetLocale}\u0000${request.text}`;
      const existing = misses.get(key);
      if (existing) {
        existing.indexes.push(index);
      } else {
        misses.set(key, { locale: request.targetLocale, request, indexes: [index] });
      }
    }),
  );

  const missesByLocale = new Map<
    TranslationMemoryLocale,
    Array<{ locale: TranslationMemoryLocale; request: TranslationRequest; indexes: number[] }>
  >();
  misses.forEach((miss) => {
    const group = missesByLocale.get(miss.locale) ?? [];
    group.push(miss);
    missesByLocale.set(miss.locale, group);
  });

  await Promise.all(
    [...missesByLocale.values()].map(async (group) => {
      const translated = await translateManyWithDeepL(
        group.map(({ request }) => request),
        apiUrl,
        apiKey,
      );
      await Promise.all(
        group.map(async (miss, responseIndex) => {
          const response = translated[responseIndex]!;
          miss.indexes.forEach((index) => {
            responses[index] = response;
          });
          if (response.ok && response.text !== undefined) {
            await memory.set(miss.locale, miss.request.text, response.text);
          }
        }),
      );
    }),
  );

  return responses;
}

const providers: Record<
  ProviderName,
  (request: TranslationRequest) => Promise<TranslationResponse>
> = {
  libretranslate: async (request) => {
    const apiUrl = env("TRANSLATION_API_URL");
    const apiKey = env("TRANSLATION_API_KEY");
    if (!apiUrl) {
      return {
        ok: false,
        provider: "libretranslate",
        reason: "LibreTranslate URL is not configured on the server.",
      };
    }
    return translateWithLibreTranslate(request, apiUrl, apiKey);
  },
  "free-translate-api": async (request) => {
    const apiUrl = env("TRANSLATION_API_URL");
    if (!apiUrl) {
      return {
        ok: false,
        provider: "free-translate-api",
        reason: "Free Translate API URL is not configured on the server.",
      };
    }
    return translateWithFreeTranslateApi(request, apiUrl);
  },
  mymemory: async (request) => {
    const apiUrl = env("TRANSLATION_API_URL") ?? "https://api.mymemory.translated.net/get";
    return translateWithMyMemory(request, apiUrl, env("TRANSLATION_MYMEMORY_EMAIL"));
  },
  deepl: async (request) => {
    const apiUrl = env("TRANSLATION_API_URL");
    const apiKey = env("TRANSLATION_API_KEY");
    if (!apiUrl || !apiKey) {
      return {
        ok: false,
        provider: "deepl",
        reason: !apiUrl
          ? "DeepL URL is not configured on the server."
          : "DeepL API key is not configured on the server.",
      };
    }
    return translateWithDeepL(request, apiUrl, apiKey);
  },
  "openai-compatible": async (request) => {
    const apiUrl = env("TRANSLATION_API_URL");
    const apiKey = env("TRANSLATION_API_KEY");
    const model = env("TRANSLATION_MODEL") ?? "configured-model";
    if (!apiUrl || !apiKey) {
      return {
        ok: false,
        provider: "openai-compatible",
        reason: "Translation service is not configured on the server.",
      };
    }
    return translateWithOpenAiCompatible(request, apiUrl, apiKey, model);
  },
  "benchmark-placeholder": async () => ({
    ok: false,
    provider: "benchmark-placeholder",
    reason: "The benchmark provider is reserved for a future adapter.",
  }),
};

export async function translateWithConfiguredProvider(request: TranslationRequest) {
  const data = translationRequestSchema.parse(request) as TranslationRequest;
  const providerName = (env("TRANSLATION_PROVIDER") ?? "libretranslate") as ProviderName;
  const normalizedRequest = {
    ...data,
    terminology: data.terminology.map((term) => ({
      source: term.source,
      protected: term.protected ?? false,
      ...(term.translations ? { translations: term.translations } : {}),
    })),
  } satisfies TranslationRequest;
  if (providerName === "deepl") {
    const apiUrl = env("TRANSLATION_API_URL");
    const apiKey = env("TRANSLATION_API_KEY");
    if (!apiUrl || !apiKey) {
      return {
        ok: false,
        provider: "deepl",
        reason: !apiUrl
          ? "DeepL URL is not configured on the server."
          : "DeepL API key is not configured on the server.",
      };
    }
    return (await translateDeepLWithMemory([normalizedRequest], apiUrl, apiKey))[0]!;
  }
  const provider = providers[providerName] ?? providers.libretranslate;
  return provider(normalizedRequest);
}

export async function translateBatchWithConfiguredProvider(requests: TranslationRequest[]) {
  const data = translationBatchRequestSchema.parse({ requests }) as {
    requests: TranslationRequest[];
  };
  const providerName = (env("TRANSLATION_PROVIDER") ?? "libretranslate") as ProviderName;
  if (providerName === "deepl") {
    const apiUrl = env("TRANSLATION_API_URL");
    const apiKey = env("TRANSLATION_API_KEY");
    if (!apiUrl || !apiKey) {
      return data.requests.map(() => ({
        ok: false,
        provider: "deepl",
        reason: !apiUrl
          ? "DeepL URL is not configured on the server."
          : "DeepL API key is not configured on the server.",
      }));
    }
    return translateDeepLWithMemory(data.requests, apiUrl, apiKey);
  }
  const provider = providers[providerName] ?? providers.libretranslate;
  return Promise.all(data.requests.map((request) => provider(request)));
}
