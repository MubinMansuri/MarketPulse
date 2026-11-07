import type { ReportSection } from "./model";

export interface EditableSectionModel {
  section: ReportSection;
  text: string;
  caption: string;
  instrument: string;
}

export function mapCanonicalSectionToEditable(section: ReportSection): EditableSectionModel {
  return {
    section,
    text: section.data.text ?? "",
    caption: section.data.caption ?? "",
    instrument: section.data.instrument ?? "",
  };
}

export function updateEditableSectionText(section: ReportSection, text: string): ReportSection {
  return { ...section, data: { ...section.data, text } };
}
