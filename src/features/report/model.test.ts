import { describe, expect, it } from "vitest";
import {
  calculateReportTextStats,
  groupPages,
  paginateSections,
  rebrandReport,
  validateFoundation,
} from "./model";
import { sampleReport } from "./sample-report";
describe("report foundation", () => {
  it("renders every fixture section once in variable page groups", () => {
    expect(
      groupPages(sampleReport.sections)
        .flat()
        .map((s) => s.id),
    ).toEqual(sampleReport.sections.map((s) => s.id));
    expect(groupPages([])).toEqual([]);
  });
  it("flags the missing chart without claiming full validation", () => {
    expect(validateFoundation(sampleReport)).toEqual([
      { severity: "warning", message: "Chart image is not attached.", sectionId: "chart" },
    ]);
  });
  it("detects empty titles, duplicate IDs and impossible dates", () => {
    const report = structuredClone(sampleReport);
    report.metadata.title = "";
    report.date = "2026-02-30";
    const first = report.sections[0];
    if (!first) throw new Error("Missing fixture section");
    report.sections.push(structuredClone(first));
    expect(validateFoundation(report).filter((i) => i.severity === "error")).toHaveLength(3);
  });
  it("preserves extra rows and unknown content in page grouping", () => {
    const report = structuredClone(sampleReport);
    const table = report.sections.find((s) => s.data.table)?.data.table;
    if (!table) throw new Error("Missing fixture table");
    table.rows.push(...Array.from({ length: 30 }, () => ({ ...table.rows[0] })));
    report.sections.push({
      id: "unknown",
      type: "unknown",
      title: "Review",
      data: { original: { retained: "Unrecognized source text" } },
    });
    expect(groupPages(report.sections).flat()).toEqual(report.sections);
    expect(validateFoundation(report).some((i) => i.sectionId === "unknown")).toBe(true);
  });
  it("keeps short content together and isolates long or large blocks without dropping sections", () => {
    const report = structuredClone(sampleReport);
    const longParagraph = {
      id: "long",
      type: "paragraph" as const,
      title: "Long translated commentary",
      data: { text: "short", translatedTextLength: 9000 },
    };
    const pages = paginateSections(
      [report.sections[0]!, longParagraph, ...report.sections.slice(1, 3)],
      740,
    );
    expect(pages).toHaveLength(3);
    expect(pages.map((page) => page.map((section) => section.id))).toEqual([
      ["overview"],
      ["long"],
      ["summary", "dashboard"],
    ]);
  });
  it("uses actual row counts for table pagination", () => {
    const report = structuredClone(sampleReport);
    const dashboard = report.sections.find((section) => section.type === "dashboard");
    if (!dashboard?.data.table) throw new Error("Missing dashboard table");
    dashboard.data.table.rows = Array.from({ length: 40 }, (_, index) => ({
      instrument: "Asset " + index,
      price: index,
    }));
    const pages = groupPages(report.sections);
    expect(pages.flat()).toHaveLength(report.sections.length);
    expect(pages.length).toBeGreaterThan(3);
  });
  it("updates the publication brand without rewriting the source archive", () => {
    const report = structuredClone(sampleReport);
    report.metadata.brandName = "Old Brand";
    report.sourcePages = [{ pageNumber: 1, text: "OLD BRAND original PDF" }];
    report.sections[0]!.title = "OLD BRAND overview";
    report.sections[0]!.data.text = "Published by Old Brand";
    const updated = rebrandReport(report, "Blue Orbit");
    expect(updated.metadata.brandName).toBe("Blue Orbit");
    expect(updated.sections[0]?.title).toBe("BLUE ORBIT overview");
    expect(updated.sections[0]?.data.text).toBe("Published by Blue Orbit");
    expect(updated.sourcePages?.[0]?.text).toBe("OLD BRAND original PDF");
  });
  it("counts rendered text without including import provenance", () => {
    const report = {
      ...structuredClone(sampleReport),
      sections: [
        {
          id: "paragraph",
          type: "paragraph" as const,
          title: "Title",
          data: { text: "Hello, world!", caption: "Two words" },
        },
      ],
      sourceLayout: { ignored: "This should not count" },
    };
    expect(calculateReportTextStats(report)).toEqual({ characters: 27, words: 5 });
  });
});
