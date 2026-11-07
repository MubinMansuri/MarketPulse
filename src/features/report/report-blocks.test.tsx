import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { sampleReport } from "./sample-report";
import { ReportBackCover, ReportBlock, ReportPage } from "./report-blocks";

describe("report brand", () => {
  it("uses the report's brand in the GTM printable masthead and footer", () => {
    const report = structuredClone(sampleReport);
    report.metadata.brandName = "Horizon Markets";
    const html = renderToStaticMarkup(
      <ReportPage report={report} pageNumber={1} pageCount={1} showGtmBranding>
        <div>Body</div>
      </ReportPage>,
    );

    expect(html).toContain("Horizon Markets");
    expect(html).toContain('class="publication-brand-mark"');
    expect(html).toContain('alt="Horizon Markets logo"');
    expect(html).not.toContain("MARKETPULSE");
  });

  it("does not render GTM artwork branding in the classic printable masthead", () => {
    const html = renderToStaticMarkup(
      <ReportPage report={sampleReport} pageNumber={1} pageCount={1}>
        <div>Body</div>
      </ReportPage>,
    );

    expect(html).not.toContain('class="publication-brand-mark"');
  });

  it("renders an imported scenario label once, not again inside its scenario text", () => {
    const html = renderToStaticMarkup(
      <ReportBlock
        section={{
          id: "scenario",
          type: "scenario",
          title: "Trading scenarios",
          data: {
            bullish: "Bullish scenario: Upside continuation above the reference level.",
            bearish: "Bearish / risk scenario: A break below support invalidates the thesis.",
          },
        }}
        editable={false}
        onChange={() => {}}
      />,
    );

    expect(html.match(/Bullish scenario/g)).toHaveLength(1);
    expect(html.match(/Bearish scenario/g)).toHaveLength(1);
    expect(html).toContain("Upside continuation above the reference level.");
    expect(html).toContain("A break below support invalidates the thesis.");
  });

  it("renders GTM back-cover copy from editable report metadata", () => {
    const report = structuredClone(sampleReport);
    report.metadata["backCoverKicker"] = "Market intelligence";
    report.metadata["backCoverHeadline"] = "Horizon Markets Research";
    report.metadata["backCoverMessage"] = "A focused brief for informed decisions.";
    const html = renderToStaticMarkup(
      <ReportBackCover
        report={report}
        pageNumber={2}
        pageCount={2}
        editable
        onMetadataChange={() => {}}
      />,
    );

    expect(html).toContain("Market intelligence");
    expect(html).toContain("Horizon Markets Research");
    expect(html).toContain("A focused brief for informed decisions.");
    expect(html.match(/role="textbox"/g)).toHaveLength(3);
  });

  it("renders the front-cover kicker as editable cover data", () => {
    const html = renderToStaticMarkup(
      <ReportBlock
        section={{
          id: "cover",
          type: "cover",
          title: "Cover",
          data: {
            kicker: "Daily market research",
            text: "Market outlook",
            caption: "A concise market brief.",
          },
        }}
        editable
        onChange={() => {}}
      />,
    );

    expect(html).toContain("Daily market research");
    expect(html).toContain('aria-label="Cover kicker"');
  });
});
