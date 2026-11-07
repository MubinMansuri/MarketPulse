import type { KnownSectionType, SectionType } from "./model";

export type EditorBlockKind =
  "cover" | "table" | "scenario" | "chart" | "text" | "spacer" | "divider" | "unknown";
export interface ReportSectionDefinition {
  label: string;
  block: EditorBlockKind;
}

export const reportSectionRegistry = {
  cover: { label: "Cover", block: "cover" },
  heading: { label: "Heading", block: "text" },
  paragraph: { label: "Paragraph", block: "text" },
  dashboard: { label: "Market dashboard", block: "table" },
  "economic-calendar": { label: "Economic calendar", block: "table" },
  "technical-analysis": { label: "Technical analysis", block: "text" },
  "fundamental-analysis": { label: "Fundamental analysis", block: "text" },
  scenario: { label: "Scenarios", block: "scenario" },
  "bias-matrix": { label: "Bias matrix", block: "table" },
  chart: { label: "Chart", block: "chart" },
  sources: { label: "Sources", block: "text" },
  methodology: { label: "Methodology", block: "text" },
  "risk-disclosure": { label: "Risk disclosure", block: "text" },
  spacer: { label: "Spacer", block: "spacer" },
  divider: { label: "Divider", block: "divider" },
} satisfies Record<KnownSectionType, ReportSectionDefinition>;

export function getSectionDefinition(type: SectionType): ReportSectionDefinition {
  return type === "unknown"
    ? { label: "Unknown section", block: "unknown" }
    : reportSectionRegistry[type];
}
