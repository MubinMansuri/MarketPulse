import { describe, expect, it, vi } from "vitest";
import { sampleReport } from "./sample-report";
import { formatReportDate, getUiLabels, isRtlLocale } from "./locale";
import {
  checkTranslationCompleteness,
  createTranslationAdapter,
  protectFinancialValues,
  restoreFinancialValues,
  type TranslationRequest,
} from "./translation";

describe("multilingual report support", () => {
  it("protects and restores instrument identifiers and financial values", () => {
    const protectedText = protectFinancialValues("EUR/USD rose 1.1650 by +0.24%.");
    expect(protectedText.text).not.toContain("EUR/USD");
    expect(protectedText.text).not.toContain("1.1650");
    expect(restoreFinancialValues(protectedText.text, protectedText.tokens)).toBe(
      "EUR/USD rose 1.1650 by +0.24%.",
    );
  });

  it("restores a protected percentage when Argos separates its marker after a minus sign", async () => {
    const adapter = createTranslationAdapter("es", async ({ text }) => ({
      ok: true,
      text: text.replace("QXSECRETTOKENAQX", "Q−XSECRETTOKENAQX"),
    }));
    const result = await adapter.translateText("−0.12%");
    expect(result).toMatchObject({ ok: true, text: "−0.12%" });
  });

  it("keeps the canonical report editable when the provider is unavailable", async () => {
    const adapter = createTranslationAdapter("es", async () => ({
      ok: false,
      reason: "Translation service unavailable.",
    }));
    const result = await adapter.translateReport(sampleReport);
    expect(result.ok).toBe(false);
    expect(result.report).toBeUndefined();
    expect(result.issues[0]?.message).toContain("unavailable");
  });

  it("rejects a table translation failure without publishing a partial translation", async () => {
    const adapter = createTranslationAdapter("es", async ({ text }) =>
      text === "INSTRUMENT"
        ? { ok: false, reason: "Table label request failed." }
        : { ok: true, text: "Traducido " + text },
    );
    const result = await adapter.translateReport(sampleReport);
    expect(result.ok).toBe(false);
    expect(result.report).toBeUndefined();
    expect(result.issues[0]?.message).toContain("Table label request failed");
  });

  it("rejects provider output that drops a protected financial value", async () => {
    const adapter = createTranslationAdapter("es", async () => ({
      ok: true,
      text: "translated without the protected value",
    }));
    const result = await adapter.translateReport(sampleReport);
    expect(result.ok).toBe(false);
    expect(result.issues[0]?.message).toContain("protected financial value");
  });

  it("translates fields through an adapter without changing protected values", async () => {
    const adapter = createTranslationAdapter("ar", async ({ text }) => ({
      ok: true,
      text: "ترجمة " + text,
      provider: "test-provider",
    }));
    const result = await adapter.translateReport(sampleReport);
    expect(result.ok).toBe(true);
    expect(result.report?.locale).toBe("ar");
    expect(result.report?.sections[2]?.data.table?.rows[0]?.["instrument"]).toBe("EUR/USD");
    expect(result.provider).toBe("test-provider");
  });

  it("translates the effective back-cover copy, including its English defaults", async () => {
    const adapter = createTranslationAdapter("es", async ({ text }) => ({
      ok: true,
      text: "Traducido " + text,
      provider: "test-provider",
    }));

    const result = await adapter.translateReport(sampleReport);

    expect(result.ok).toBe(true);
    expect(result.report?.metadata["backCoverKicker"]).toBe("Traducido Daily Market Report");
    expect(result.report?.metadata["backCoverHeadline"]).toBe("Traducido Market Intelligence");
    expect(result.report?.metadata["backCoverMessage"]).toBe(
      "Traducido Clear data. Clear context. Disciplined decisions.",
    );
  });

  it("coalesces simultaneous translation requests into one batch", async () => {
    const translateBatch = vi.fn(async (requests: TranslationRequest[]) =>
      requests.map((request) => ({ ok: true, text: "Translated " + request.text })),
    );
    const adapter = createTranslationAdapter(
      "ar",
      async () => ({ ok: false, reason: "Single request should not be used." }),
      undefined,
      translateBatch,
    );

    await expect(
      Promise.all([adapter.translateText("First"), adapter.translateText("Second")]),
    ).resolves.toEqual([
      { ok: true, text: "Translated First" },
      { ok: true, text: "Translated Second" },
    ]);
    expect(translateBatch).toHaveBeenCalledTimes(1);
    expect(translateBatch.mock.calls[0]?.[0]).toHaveLength(2);
  });

  it("keeps a safe server error when a translation batch fails", async () => {
    const adapter = createTranslationAdapter(
      "es",
      async () => ({ ok: false, reason: "unused" }),
      undefined,
      async () => {
        throw new Error("Too many translation requests. Please try again shortly.");
      },
    );

    await expect(adapter.translateText("Market outlook")).resolves.toMatchObject({
      ok: false,
      reason: "Too many translation requests. Please try again shortly.",
    });
  });

  it("warns when translated fields remain equal to the English source", () => {
    const translated = structuredClone(sampleReport);
    translated.locale = "es";
    const issues = checkTranslationCompleteness(sampleReport, translated);
    expect(issues.length).toBeGreaterThan(0);
    expect(issues[0]?.severity).toBe("warning");
  });

  it("provides locale-aware interface labels, RTL mode, and dates", () => {
    expect(getUiLabels("es").reportTitle).toBe("Título del informe");
    expect(getUiLabels("ar").reportTitle).toContain("التقرير");
    expect(isRtlLocale("ar")).toBe(true);
    expect(formatReportDate("2026-10-10", "es")).toContain("octubre");
    expect(formatReportDate("2026-10-10", "ar")).toContain("٢٠٢٦");
  });
});
