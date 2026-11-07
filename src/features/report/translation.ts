import type { CanonicalReport, Cell, Locale, ReportSection, ValidationIssue } from "./model";
import { brand } from "./brand";
import { createFinancialTerminologyDictionary } from "./terminology";

const protectedTokenPattern =
  /\b(?:EUR\/USD|GBP\/USD|XAU\/USD|US30|WTI|DXY)\b|(?<![A-Za-z])(?:[$€£]?\d[\d,.]*(?:\.\d+)?%?)(?![A-Za-z])/g;

function protectedMarkerName(index: number): string {
  let value = index + 1;
  let name = "";
  while (value > 0) {
    value -= 1;
    name = String.fromCharCode(65 + (value % 26)) + name;
    value = Math.floor(value / 26);
  }
  return name;
}

const protectedMarker = (index: number) => `QXSECRETTOKEN${protectedMarkerName(index)}QX`;
// Argos may insert a dash between Q and X when the marker follows a Unicode
// minus sign. Accept that separator only inside the marker; the original sign
// remains outside it and is therefore retained exactly as supplied.
const protectedMarkerPattern =
  /Q[-\s\u2212\u2013\u2014]*XSECRETTOKEN([A-Z]+)Q[-\s\u2212\u2013\u2014]*X/g;

function protectedMarkerIndex(name: string): number {
  return [...name].reduce((value, character) => value * 26 + character.charCodeAt(0) - 64, 0) - 1;
}

function hasProtectedMarker(text: string, index: number): boolean {
  const expectedName = protectedMarkerName(index);
  return new RegExp(
    `Q[-\\s\\u2212\\u2013\\u2014]*XSECRETTOKEN${expectedName}Q[-\\s\\u2212\\u2013\\u2014]*X`,
  ).test(text);
}

export interface ProtectedText {
  text: string;
  tokens: string[];
}
export function protectFinancialValues(
  text: string,
  terminology = createFinancialTerminologyDictionary(),
): ProtectedText {
  const terms = [...terminology.values()]
    .filter((term) => term.protected)
    .map((term) => term.source.replace(/[.*+?^()|[\]\\]/g, "\\$&"));
  const pattern = terms.length
    ? new RegExp("(?:" + terms.join("|") + ")|" + protectedTokenPattern.source, "g")
    : protectedTokenPattern;
  const tokens: string[] = [];
  return {
    text: text.replace(pattern, (value) => {
      const index = tokens.push(value) - 1;
      // Opaque alphabetic markers survive Argos/LibreTranslate. Punctuation-based
      // placeholders are treated as formatting and can be stripped by its models.
      return protectedMarker(index);
    }),
    tokens,
  };
}

export function restoreFinancialValues(text: string, tokens: string[]): string {
  return text.replace(
    protectedMarkerPattern,
    (_, name: string) => tokens[protectedMarkerIndex(name)] ?? "",
  );
}

export interface TranslationTermPayload {
  source: string;
  protected?: boolean | undefined;
  translations?: { es?: string | undefined; ar?: string | undefined } | undefined;
}
export interface TranslationRequest {
  text: string;
  sourceLocale: "en";
  targetLocale: Exclude<Locale, "en">;
  terminology: TranslationTermPayload[];
}
export interface TranslationResponse {
  ok: boolean;
  text?: string | undefined;
  provider?: string | undefined;
  reason?: string | undefined;
}
export interface TranslationResult {
  ok: boolean;
  report?: CanonicalReport | undefined;
  issues: ValidationIssue[];
  provider?: string | undefined;
}
export interface TranslationAdapter {
  targetLocale: Exclude<Locale, "en">;
  translateText(text: string): Promise<TranslationResponse>;
  translateReport(report: CanonicalReport): Promise<TranslationResult>;
}

const backCoverFields = [
  ["backCoverKicker", brand.publication],
  ["backCoverHeadline", "Market Intelligence"],
  ["backCoverMessage", "Clear data. Clear context. Disciplined decisions."],
] as const;

function getBackCoverText(
  report: CanonicalReport,
  key: (typeof backCoverFields)[number][0],
  fallback: string,
) {
  return typeof report.metadata[key] === "string" ? (report.metadata[key] as string) : fallback;
}

type TranslateBatch = (requests: TranslationRequest[]) => Promise<TranslationResponse[]>;

function createRequestBatcher(
  translateText: (request: TranslationRequest) => Promise<TranslationResponse>,
  translateBatch?: TranslateBatch,
) {
  if (!translateBatch) return translateText;
  let queued: Array<{
    request: TranslationRequest;
    resolve: (response: TranslationResponse) => void;
  }> = [];
  let flushScheduled = false;
  const flush = async () => {
    flushScheduled = false;
    const pending = queued;
    queued = [];
    try {
      let cursor = 0;
      while (cursor < pending.length) {
        let size = 0;
        const chunk: typeof pending = [];
        while (cursor < pending.length && chunk.length < 50) {
          const item = pending[cursor]!;
          const nextSize = size + new TextEncoder().encode(item.request.text).byteLength;
          if (chunk.length && nextSize > 100_000) break;
          chunk.push(item);
          size = nextSize;
          cursor += 1;
        }
        const responses = await translateBatch(chunk.map(({ request }) => request));
        chunk.forEach(({ resolve }, index) =>
          resolve(
            responses[index] ?? {
              ok: false,
              reason: "Translation service returned an incomplete batch.",
            },
          ),
        );
      }
    } catch {
      pending.forEach(({ resolve }) =>
        resolve({ ok: false, reason: "Translation service could not be reached." }),
      );
    }
  };
  return (request: TranslationRequest) =>
    new Promise<TranslationResponse>((resolve) => {
      queued.push({ request, resolve });
      if (!flushScheduled) {
        flushScheduled = true;
        queueMicrotask(flush);
      }
    });
}

export function translationFields(section: ReportSection): string[] {
  return [
    section.title,
    section.data.text ?? "",
    section.data.caption ?? "",
    section.data.bullish ?? "",
    section.data.bearish ?? "",
  ].filter(Boolean);
}

export function checkTranslationCompleteness(
  source: CanonicalReport,
  translated: CanonicalReport,
): ValidationIssue[] {
  if (translated.locale === source.locale) return [];
  const issues: ValidationIssue[] = [];
  translated.sections.forEach((section, index) => {
    const sourceSection = source.sections[index];
    if (!sourceSection) {
      issues.push({
        severity: "warning",
        message: "Translated report contains a section with no source counterpart.",
        sectionId: section.id,
      });
      return;
    }
    const sourceFields = translationFields(sourceSection);
    const translatedFields = translationFields(section);
    sourceFields.forEach((value, fieldIndex) => {
      if (value && value === translatedFields[fieldIndex]) {
        issues.push({
          severity: "warning",
          message: "Text is unchanged from the English source and needs translation review.",
          sectionId: section.id,
        });
      }
    });
  });
  backCoverFields.forEach(([key, fallback]) => {
    const sourceText = getBackCoverText(source, key, fallback);
    const translatedText = getBackCoverText(translated, key, fallback);
    if (sourceText && sourceText === translatedText) {
      issues.push({
        severity: "warning",
        message:
          "Back-cover text is unchanged from the English source and needs translation review.",
      });
    }
  });
  return issues;
}

export function createTranslationAdapter(
  targetLocale: Exclude<Locale, "en">,
  translateText: (request: TranslationRequest) => Promise<TranslationResponse>,
  terminology = createFinancialTerminologyDictionary(),
  translateBatch?: TranslateBatch,
): TranslationAdapter {
  const translateQueued = createRequestBatcher(translateText, translateBatch);
  const cache = new Map<string, Promise<TranslationResponse>>();
  async function translateValue(value: string): Promise<TranslationResponse> {
    if (!value) return { ok: true, text: "" };
    const protectedText = protectFinancialValues(value, terminology);
    const request = {
      text: protectedText.text,
      sourceLocale: "en" as const,
      targetLocale,
      terminology: [...terminology.values()].map((term) => ({
        source: term.source,
        protected: term.protected ?? false,
        ...(term.translations ? { translations: term.translations } : {}),
      })),
    };
    const cacheKey = targetLocale + "\\u0000" + request.text;
    const response = await (cache.get(cacheKey) ??
      (() => {
        const pending = translateQueued(request);
        cache.set(cacheKey, pending);
        return pending;
      })());
    if (!response.ok || response.text === undefined) return response;
    for (let index = 0; index < protectedText.tokens.length; index += 1) {
      if (!hasProtectedMarker(response.text, index)) {
        return {
          ok: false,
          provider: response.provider,
          reason:
            "Translation changed protected financial value #" +
            (index + 1) +
            "; the report was kept unchanged.",
        };
      }
    }
    return { ...response, text: restoreFinancialValues(response.text, protectedText.tokens) };
  }

  return {
    targetLocale,
    translateText: translateValue,
    async translateReport(report) {
      const translatedBackCover = await Promise.all(
        backCoverFields.map(async ([key, fallback]) => {
          const value = getBackCoverText(report, key, fallback);
          return [key, value, await translateValue(value)] as const;
        }),
      );
      const backCoverFailure = translatedBackCover.find(([, , response]) => !response.ok)?.[2];
      if (backCoverFailure) {
        return {
          ok: false,
          issues: [
            {
              severity: "warning",
              message:
                backCoverFailure.reason ??
                "Back-cover translation failed; the English report was kept.",
            },
          ],
          provider: backCoverFailure.provider,
        };
      }
      const sections: ReportSection[] = [];
      let provider: string | undefined;
      for (const section of report.sections) {
        const [title, text, caption, bullish, bearish] = await Promise.all([
          translateValue(section.title),
          translateValue(section.data.text ?? ""),
          translateValue(section.data.caption ?? ""),
          translateValue(section.data.bullish ?? ""),
          translateValue(section.data.bearish ?? ""),
        ]);
        const response = [title, text, caption, bullish, bearish].find((item) => !item.ok);
        provider ??= response?.provider ?? title.provider;
        if (response) {
          return {
            ok: false,
            issues: [
              {
                severity: "warning",
                message:
                  response.reason ??
                  "Translation service unavailable; the English report was kept.",
              },
            ],
            provider,
          };
        }
        const translatedTable = section.data.table
          ? await Promise.all([
              Promise.all(section.data.table.columns.map((column) => translateValue(column.label))),
              Promise.all(
                section.data.table.rows.map(async (row) => {
                  const entries = await Promise.all(
                    Object.entries(row).map(async ([key, value]) => {
                      if (typeof value !== "string") return [key, value] as const;
                      const term = terminology.get(value);
                      const configured = term?.translations?.[targetLocale];
                      if (configured) return [key, configured] as const;
                      const protectedValue = protectFinancialValues(value, terminology);
                      const unprotectedText = protectedValue.text
                        .replace(protectedMarkerPattern, "")
                        .trim();
                      if (protectedValue.tokens.length > 0 && unprotectedText === "") {
                        return [key, value] as const;
                      }
                      const translatedValue = await translateValue(value);
                      return [key, translatedValue] as const;
                    }),
                  );
                  return Object.fromEntries(entries);
                }),
              ),
            ])
          : undefined;
        const tableResults = translatedTable
          ? [...translatedTable[0], ...translatedTable[1].flatMap((row) => Object.values(row))]
          : [];
        const tableFailure = tableResults.find(
          (value): value is TranslationResponse =>
            typeof value === "object" && value !== null && "ok" in value && !value.ok,
        );
        if (tableFailure) {
          return {
            ok: false,
            issues: [
              {
                severity: "warning",
                message:
                  tableFailure.reason ?? "Table translation failed; the report was kept unchanged.",
                sectionId: section.id,
              },
            ],
            provider: tableFailure.provider ?? provider,
          };
        }
        sections.push({
          ...section,
          title: title.text ?? section.title,
          data: {
            ...section.data,
            ...(text.text === undefined ? {} : { text: text.text }),
            ...(caption.text === undefined ? {} : { caption: caption.text }),
            ...(bullish.text === undefined ? {} : { bullish: bullish.text }),
            ...(bearish.text === undefined ? {} : { bearish: bearish.text }),
            ...(translatedTable
              ? {
                  table: {
                    columns: section.data.table!.columns.map((column, index) => ({
                      ...column,
                      label: translatedTable[0][index]?.text ?? column.label,
                    })),
                    rows: translatedTable[1].map(
                      (row): Record<string, Cell> =>
                        Object.fromEntries(
                          Object.entries(row).map(([key, value]) => [
                            key,
                            typeof value === "object" &&
                            value !== null &&
                            "ok" in value &&
                            "text" in value
                              ? (value.text ?? "")
                              : value,
                          ]),
                        ) as Record<string, Cell>,
                    ),
                  },
                }
              : {}),
          },
        });
      }
      const translated: CanonicalReport = {
        ...report,
        locale: targetLocale,
        metadata: {
          ...report.metadata,
          ...Object.fromEntries(
            translatedBackCover.map(([key, value, response]) => [key, response.text ?? value]),
          ),
        },
        sections,
      };
      return {
        ok: true,
        report: translated,
        issues: checkTranslationCompleteness(report, translated),
        provider,
      };
    },
  };
}
