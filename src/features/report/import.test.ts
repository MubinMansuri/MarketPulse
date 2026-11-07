import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import {
  groupPages,
  parseReportJson,
  parseReportJsonText,
  serializeCanonicalReport,
} from "./model";
import { mapCanonicalSectionToEditable, updateEditableSectionText } from "./report-mapping";
import { reportSectionRegistry } from "./report-registry";

const base = {
  schemaVersion: "1.0",
  id: "import-test",
  date: "2026-10-10",
  sourceLocale: "en",
  locale: "en",
  metadata: { title: "Imported report", edition: "TEST" },
};

describe("Phase 2 and 3 report import", () => {
  it("validates, normalizes, and preserves unknown sections", () => {
    const result = parseReportJson({
      ...base,
      sections: [
        { id: "cover", type: "cover", title: "Cover", data: { text: "Imported" } },
        { id: "vendor", type: "vendor-chart", title: "Vendor chart", data: { raw: { value: 4 } } },
      ],
    });
    expect(result.ok).toBe(true);
    expect(result.report?.sections[1]).toMatchObject({
      id: "vendor",
      type: "unknown",
      data: { unknownType: "vendor-chart", original: { id: "vendor", type: "vendor-chart" } },
    });
    expect(result.issues.some((issue) => issue.message.includes("preserved for review"))).toBe(
      true,
    );
  });

  it("round-trips GTM metadata and custom section types for a canonical download", () => {
    const result = parseReportJson({
      ...base,
      metadata: { ...base.metadata, dataAsOf: "2026-10-14 morning UTC" },
      sections: [
        { id: "vendor", type: "vendor-chart", title: "Vendor chart", data: { raw: { value: 4 } } },
      ],
    });
    expect(result.ok).toBe(true);
    const downloaded = serializeCanonicalReport(result.report!);
    expect(downloaded.metadata["dataAsOf"]).toBe("2026-10-14 morning UTC");
    expect(downloaded.sections[0]).toMatchObject({
      id: "vendor",
      type: "vendor-chart",
      data: { raw: { value: 4 } },
    });
    expect(parseReportJson(downloaded).ok).toBe(true);
  });

  it("accepts a custom brand while keeping older reports without that field importable", () => {
    const sections = [{ id: "cover", type: "cover", title: "Cover", data: { text: "Report" } }];
    const legacy = parseReportJson({ ...base, sections });
    const branded = parseReportJson({
      ...base,
      metadata: { ...base.metadata, brandName: "Horizon Markets" },
      sections,
    });
    expect(legacy.ok).toBe(true);
    expect(branded.report?.metadata.brandName).toBe("Horizon Markets");
  });

  it("rejects malformed JSON and reports specific schema paths", () => {
    expect(parseReportJsonText("{not-json").issues[0]?.message).toContain("could not be parsed");
    const result = parseReportJson({
      ...base,
      sections: [{ id: "", type: "paragraph", title: "Bad", data: {} }],
    });
    expect(result.ok).toBe(false);
    expect(result.issues[0]?.message).toContain("sections.0.id");
  });

  it("normalizes variable table lengths without hardcoded counts", () => {
    const result = parseReportJson({
      ...base,
      sections: [
        {
          id: "calendar",
          type: "economic-calendar",
          title: "Calendar",
          data: {
            table: {
              columns: [{ key: "event", label: "Event" }],
              rows: Array.from({ length: 11 }, (_, index) => ({ event: "Event " + index })),
            },
          },
        },
      ],
    });
    expect(result.ok).toBe(true);
    expect(result.report?.sections[0]?.data.table?.rows).toHaveLength(11);
    expect(groupPages(result.report?.sections ?? []).flat()).toHaveLength(1);
  });

  it("maps editable content back to the same canonical section", () => {
    const result = parseReportJson({
      ...base,
      sections: [{ id: "p", type: "paragraph", title: "Paragraph", data: { text: "Before" } }],
    });
    const section = result.report?.sections[0];
    if (!section) throw new Error("Expected parsed section");
    expect(mapCanonicalSectionToEditable(section).text).toBe("Before");
    expect(updateEditableSectionText(section, "After").data.text).toBe("After");
  });

  it("registers every supported section type", () => {
    expect(Object.keys(reportSectionRegistry)).toHaveLength(13);
    expect(reportSectionRegistry["economic-calendar"].block).toBe("table");
  });

  it("converts PDF layout JSON without discarding its original extraction payload", () => {
    const layout = JSON.parse(readFileSync("sample_data_report.json", "utf8")) as unknown;
    const result = parseReportJson(layout);
    expect(result.ok).toBe(true);
    expect(result.report).toMatchObject({
      schemaVersion: "1.0",
      date: "2026-09-23",
      metadata: {
        title: "Daily Market Report",
        edition: "PDF layout import",
        brandName: "Global Trend Markets",
      },
    });
    expect(result.report?.sourcePages).toHaveLength(13);
    expect(result.report?.sections.some((section) => section.id === "table-p2-1")).toBe(true);
    expect(result.report?.sourceLayout).toEqual(layout);
  });

  it("uses explicit layout scenarios and chart URLs when the extraction provides them", () => {
    const layout = JSON.parse(readFileSync("sample_data_report.json", "utf8")) as {
      scenarios?: unknown[];
      chartUrls?: unknown[];
    };
    layout.scenarios = [
      {
        page: 4,
        bullishScenario: { text: "Updated bullish case" },
        bearishRiskScenario: { text: "Updated bearish risk" },
      },
    ];
    layout.chartUrls = [{ page: 4, url: "https://www.tradingview.com/chart/example/" }];
    const result = parseReportJson(layout);
    expect(result.ok).toBe(true);
    expect(
      result.report?.sections.find((section) => section.id === "scenario-page-4")?.data,
    ).toMatchObject({ bullish: "Updated bullish case", bearish: "Updated bearish risk" });
    expect(
      result.report?.sections.find((section) => section.id === "chart-page-4")?.data.chartUrl,
    ).toBe("https://www.tradingview.com/chart/example/");
  });

  it("imports the canonical GTM template without validation issues", () => {
    const template = JSON.parse(
      readFileSync("gtm-canonical-report.sample.json", "utf8"),
    ) as unknown;
    const result = parseReportJson(template);
    expect(result.ok).toBe(true);
    expect(result.issues).toEqual([]);
    expect(
      result.report?.sections.find((section) => section.id === "eurusd-chart")?.data.chartUrl,
    ).toBe("https://www.tradingview.com/symbols/EURUSD/");
  });
});
