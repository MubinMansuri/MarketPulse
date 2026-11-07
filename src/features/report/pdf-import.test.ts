import { describe, expect, it } from "vitest";
import { linesFromSpans, mapPdfPages, parseExtractedPdfText, type PdfSpan } from "./pdf-import";

describe("PDF import normalization", () => {
  it("maps extracted report headings, dates, and delimited tables", () => {
    const result = parseExtractedPdfText(
      `
      MARKETPULSE DAILY MARKET REPORT
      09 October 2026
      01 Executive summary
      Rates remain in focus as markets reassess inflation expectations.
      02 Market dashboard
      INSTRUMENT | REFERENCE PRICE | CHANGE
      EUR/USD | 1.1650 | +0.24%
      03 Trading scenarios
      Bullish scenario
      A sustained break higher supports continuation.
      Bearish scenario
      A close below support invalidates the view.
      04 Risk disclosure
      Demonstration content only.
    `,
      "market-report.pdf",
    );

    expect(result.ok).toBe(true);
    expect(result.report?.date).toBe("2026-10-09");
    expect(result.report?.metadata.title).toContain("DAILY MARKET REPORT");
    expect(result.report?.sections.map((section) => section.type)).toEqual([
      "paragraph",
      "dashboard",
      "scenario",
      "risk-disclosure",
    ]);
    expect(result.report?.sections[1]?.data.table?.rows[0]?.["column-1"]).toBe("EUR/USD");
    expect(result.issues.some((issue) => issue.severity === "warning")).toBe(true);
  });

  it("keeps an unstructured text PDF editable with a warning", () => {
    const result = parseExtractedPdfText("A short imported market commentary.", "notes.pdf");

    expect(result.ok).toBe(true);
    expect(result.report?.sections).toHaveLength(1);
    expect(result.report?.sections[0]?.data.text).toContain("market commentary");
    expect(
      result.issues.some((issue) => issue.message.includes("No supported report headings")),
    ).toBe(true);
  });

  it("rejects PDFs with no extractable text safely", () => {
    const result = parseExtractedPdfText("", "empty.pdf");

    expect(result.ok).toBe(false);
    expect(result.report).toBeUndefined();
    expect(result.issues[0]?.message).toContain("no extractable text");
  });

  it("maps a changed, coordinate-based layout without fixed column positions or headings", () => {
    const at = (text: string, x: number, y: number, height = 10): PdfSpan => ({
      text,
      x,
      y,
      width: text.length * 5,
      height,
    });
    const spans = [
      at("ALPHA WEEKLY BRIEF", 30, 750, 22),
      at("Published by Blue Orbit", 30, 700),
      at("12 October 2026", 30, 680),
      at("Portfolio Snapshot", 30, 610, 15),
      at("Item", 40, 570),
      at("Value", 270, 570),
      at("Trend", 490, 570),
      at("Gold", 40, 545),
      at("4310", 270, 545),
      at("Rising", 490, 545),
      at("Oil", 40, 520),
      at("98", 270, 520),
      at("Falling", 490, 520),
      at("Analyst Notes", 30, 460, 15),
      at("All figures are provisional.", 30, 430),
    ];
    const lines = linesFromSpans(spans);
    const result = mapPdfPages(
      [
        {
          pageNumber: 1,
          width: 700,
          height: 800,
          lines,
          text: lines.map((line) => line.text).join("\n"),
        },
      ],
      "changing.pdf",
    );
    expect(result.ok).toBe(true);
    expect(result.report?.metadata.brandName).toBe("Blue Orbit");
    expect(result.report?.sourcePages?.[0]?.text).toContain("All figures are provisional.");
    expect(
      result.report?.sections.find((section) => section.data.table)?.data.table?.rows,
    ).toHaveLength(2);
    expect(
      result.report?.sections.some((section) => section.data.text?.includes("All figures")),
    ).toBe(true);
  });
});
