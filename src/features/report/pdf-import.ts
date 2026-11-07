import { GlobalWorkerOptions, getDocument } from "pdfjs-dist/legacy/build/pdf.mjs";
import {
  validateFoundation,
  type CanonicalReport,
  type ReportSection,
  type TableData,
  type ValidationIssue,
} from "./model";

export interface PdfSpan {
  text: string;
  x: number;
  y: number;
  width: number;
  height: number;
}
export interface PdfLine {
  text: string;
  y: number;
  height: number;
  spans: PdfSpan[];
}
export interface PdfPage {
  pageNumber: number;
  width: number;
  height: number;
  lines: PdfLine[];
  text: string;
}
export interface PdfExtractionResult {
  pages: string[];
  text: string;
  layout?: PdfPage[];
}
export interface PdfImportResult {
  ok: boolean;
  report?: CanonicalReport;
  extraction?: PdfExtractionResult;
  issues: ValidationIssue[];
}

GlobalWorkerOptions.workerSrc = new URL(
  "pdfjs-dist/legacy/build/pdf.worker.mjs",
  import.meta.url,
).toString();
const clean = (value: string) => value.replace(/\s+/g, " ").trim();
const slug = (value: string) =>
  value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "") || "section";

// PDF.js returns positioned spans, not lines. Keep geometry for table inference.
export function linesFromSpans(spans: PdfSpan[]): PdfLine[] {
  const rows: PdfLine[] = [];
  for (const span of spans.filter((item) => clean(item.text))) {
    let row = rows.find(
      (item) => Math.abs(item.y - span.y) <= Math.max(2, Math.min(item.height, span.height) * 0.3),
    );
    if (!row) {
      row = { text: "", y: span.y, height: span.height, spans: [] };
      rows.push(row);
    }
    row.spans.push(span);
    row.height = Math.max(row.height, span.height);
  }
  return rows
    .sort((a, b) => b.y - a.y)
    .map((row) => {
      row.spans.sort((a, b) => a.x - b.x);
      row.text = row.spans
        .map((span) => clean(span.text))
        .join(" ")
        .replace(/\s+([,.;:!?])/g, "$1");
      return row;
    });
}
function reportType(title: string): ReportSection["type"] {
  if (/scenario/i.test(title)) return "scenario";
  if (/risk|disclaimer|disclosure/i.test(title)) return "risk-disclosure";
  if (/method|source|reference/i.test(title)) return "sources";
  if (/calendar|events?/i.test(title)) return "economic-calendar";
  if (/matrix|bias/i.test(title)) return "bias-matrix";
  if (/dashboard|snapshot|at a glance/i.test(title)) return "dashboard";
  if (/technical/i.test(title)) return "technical-analysis";
  if (/fundamental/i.test(title)) return "fundamental-analysis";
  if (/chart|price structure/i.test(title)) return "chart";
  return "paragraph";
}
function dateFrom(text: string): string {
  const iso = text.match(/\b20\d{2}-\d{2}-\d{2}\b/)?.[0];
  if (iso && !Number.isNaN(Date.parse(iso))) return iso;
  const long = text.match(
    /\b(\d{1,2})\s+(January|February|March|April|May|June|July|August|September|October|November|December)\s+(20\d{2})\b/i,
  );
  if (long) {
    const parsed = new Date(`${long[1]} ${long[2]} ${long[3]} UTC`);
    if (!Number.isNaN(parsed.valueOf())) return parsed.toISOString().slice(0, 10);
  }
  return new Date().toISOString().slice(0, 10);
}
function isHeading(
  line: PdfLine,
  previous: PdfLine | undefined,
  median: number,
  leftMargin: number,
): boolean {
  const title = clean(line.text);
  if (
    !title ||
    title.length > 85 ||
    /[.!?;:]$/.test(title) ||
    /^\d+$/.test(title) ||
    line.spans.length > 2 ||
    (line.spans[0]?.x ?? 0) > leftMargin + 45
  )
    return false;
  const gap = previous ? previous.y - line.y : 100;
  const prominent = line.height >= median * 1.22;
  const separated = gap >= median * 1.8;
  const compact = title.split(/\s+/).length <= 8;
  const labelCase =
    title === title.toUpperCase() ||
    /^(?:\d+[.)]?\s*)?[A-Z][\w/&–—-]*(?:\s+(?:[A-Z][\w/&–—-]*|&))+$/.test(title);
  return prominent || (compact && separated && labelCase);
}
function tableFromLines(lines: PdfLine[]): { table: TableData; used: number } | undefined {
  if (lines.length < 3) return undefined;
  const anchors = lines[0]!.spans.map((span) => span.x);
  if (anchors.length < 2 || anchors.length > 10) return undefined;
  const matches = (line: PdfLine) =>
    line.spans.filter((span) => anchors.some((anchor) => Math.abs(anchor - span.x) < 18)).length;
  const compatible = (line: PdfLine) =>
    line.spans.length >= Math.max(2, anchors.length - 1) &&
    matches(line) >= Math.max(2, anchors.length - 1);
  let used = 1;
  let lastMajor = 0;
  while (used < lines.length && used - lastMajor <= 4) {
    const line = lines[used]!;
    if (
      lines[lastMajor]!.y - line.y > 60 ||
      /^sources?\s*:/i.test(line.text) ||
      matches(line) === 0
    )
      break;
    if (compatible(line)) lastMajor = used;
    used += 1;
  }
  used = lastMajor + 1;
  while (
    used < lines.length &&
    lines[lastMajor]!.y - lines[used]!.y <= 12 &&
    matches(lines[used]!) > 0 &&
    !/^sources?\s*:/i.test(lines[used]!.text)
  )
    used += 1;
  if (used < 3 || lines.slice(1, used).filter(compatible).length < 2) return undefined;
  const columns = anchors.map((_, index) => ({
    key: `column-${index + 1}`,
    label: clean(lines[0]!.spans[index]?.text ?? `Column ${index + 1}`),
  }));
  const rowLines = lines.slice(1, used).filter(compatible);
  const rows = rowLines.map((line) => {
    const cells = columns.map(() => "");
    const extras = lines
      .slice(1, used)
      .filter(
        (other) =>
          !compatible(other) &&
          Math.abs(other.y - line.y) <= 12 &&
          rowLines.every(
            (candidate) => Math.abs(other.y - line.y) <= Math.abs(other.y - candidate.y),
          ),
      );
    for (const span of [...line.spans, ...extras.flatMap((other) => other.spans)].sort(
      (a, b) => a.x - b.x,
    )) {
      const index = anchors.reduce(
        (best, anchor, current) =>
          Math.abs(anchor - span.x) < Math.abs(anchors[best]! - span.x) ? current : best,
        0,
      );
      cells[index] = clean(`${cells[index]} ${span.text}`);
    }
    return Object.fromEntries(columns.map((column, index) => [column.key, cells[index] ?? ""]));
  });
  return { table: { columns, rows }, used };
}
function delimitedTable(lines: string[]): TableData | undefined {
  const cells = lines.map((line) => line.split(/\s*\|\s*|\t+/).map(clean));
  if (
    cells.length < 2 ||
    (cells[0]?.length ?? 0) < 2 ||
    !cells.every((row) => row.length === cells[0]?.length)
  )
    return undefined;
  const columns = cells[0]!.map((label, index) => ({ key: `column-${index + 1}`, label }));
  return {
    columns,
    rows: cells
      .slice(1)
      .map((row) =>
        Object.fromEntries(columns.map((column, index) => [column.key, row[index] ?? ""])),
      ),
  };
}
export function mapPdfPages(pages: PdfPage[], fileName: string): PdfImportResult {
  const allText = pages.map((page) => page.text).join("\n");
  if (!clean(allText))
    return {
      ok: false,
      issues: [
        {
          severity: "error",
          message: "PDF contains no extractable text. Scanned PDFs require OCR before editing.",
        },
      ],
    };
  const firstPage = pages[0]?.lines ?? [];
  const candidate = firstPage
    .filter(
      (line) => line.y < (pages[0]?.height ?? 0) * 0.94 && line.y > (pages[0]?.height ?? 0) * 0.08,
    )
    .sort((a, b) => b.height - a.height)[0];
  const title =
    candidate && candidate.height >= 14 ? candidate.text : fileName.replace(/\.pdf$/i, "");
  const brandName = allText
    .match(/\b(?:prepared|published|presented)\s+by\s+([^\n]+)/i)?.[1]
    ?.trim();
  const sections: ReportSection[] = [];
  let sourcePage = 1;
  const add = (type: ReportSection["type"], title: string, data: ReportSection["data"]) =>
    sections.push({
      id: `${slug(title)}-${sections.length + 1}`,
      type,
      title,
      data: { ...data, sourcePage },
    });
  for (const page of pages) {
    sourcePage = page.pageNumber;
    const body = page.lines.filter(
      (line) => line.y <= page.height * 0.93 && line.y >= page.height * 0.055,
    );
    const heights = body.map((line) => line.height).sort((a, b) => a - b);
    const median = heights[Math.floor(heights.length / 2)] ?? 10;
    const leftMargin = Math.min(...body.map((line) => line.spans[0]?.x ?? Infinity));
    let heading = page.pageNumber === 1 ? "Cover" : `Page ${page.pageNumber}`;
    let type: ReportSection["type"] = page.pageNumber === 1 ? "cover" : "paragraph";
    let buffer: PdfLine[] = [];
    const flush = () => {
      if (!buffer.length) return;
      const content = buffer.filter(
        (line) =>
          !(page.pageNumber === 1 && (line.text === title || /^prepared by\b/i.test(line.text))),
      );
      if (!content.length) {
        buffer = [];
        return;
      }
      if (page.pageNumber === 1 && type === "cover") {
        add("cover", "Cover", {
          text: title,
          caption: content.map((line) => line.text).join("\n"),
        });
        buffer = [];
        return;
      }
      if (type === "scenario") {
        const middle = page.width / 2;
        const bullish = content
          .flatMap((line) =>
            line.spans.filter((span) => span.x < middle).map((span) => clean(span.text)),
          )
          .filter(Boolean)
          .join("\n");
        const bearish = content
          .flatMap((line) =>
            line.spans.filter((span) => span.x >= middle).map((span) => clean(span.text)),
          )
          .filter(Boolean)
          .join("\n");
        add(type, heading, { bullish, bearish });
        buffer = [];
        return;
      }
      let cursor = 0;
      let lead: string[] = [];
      while (cursor < content.length) {
        const table = tableFromLines(content.slice(cursor));
        if (table) {
          if (lead.length) {
            add(type, heading, { text: lead.join("\n") });
            lead = [];
          }
          add(type === "paragraph" ? "dashboard" : type, heading, { table: table.table });
          cursor += table.used;
        } else {
          lead.push(content[cursor]!.text);
          cursor += 1;
        }
      }
      if (lead.length) {
        add(type, heading, { text: lead.join("\n") });
      }
      buffer = [];
    };
    for (let index = 0; index < body.length; index += 1) {
      const line = body[index]!;
      if (page.pageNumber === 1 && line.text === title) {
        buffer.push(line);
        continue;
      }
      if (
        isHeading(line, body[index - 1], median, leftMargin) &&
        !(buffer.length === 0 && line.text === heading)
      ) {
        if (!buffer.length && heading !== "Cover" && !/^Page \d+$/.test(heading))
          add("heading", heading, { text: "" });
        flush();
        heading = line.text.replace(/^\d{1,2}[.)]?\s+/, "");
        type = reportType(heading);
        continue;
      }
      buffer.push(line);
    }
    flush();
  }
  if (!sections.length) add("paragraph", "Imported content", { text: allText });
  const report: CanonicalReport = {
    schemaVersion: "1.0",
    id: `pdf-${Date.now()}`,
    date: dateFrom(allText),
    sourceLocale: "en",
    locale: "en",
    metadata: { title, edition: "PDF import", ...(brandName ? { brandName } : {}) },
    sourcePages: pages.map(({ pageNumber, text }) => ({ pageNumber, text })),
    sections,
  };
  const issues: ValidationIssue[] = [
    {
      severity: "warning",
      message:
        "PDF structure is inferred. Review tables, reading order, dates, charts, and financial values before publishing.",
    },
  ];
  const emptyPages = pages.filter((page) => !clean(page.text)).map((page) => page.pageNumber);
  if (emptyPages.length)
    issues.push({
      severity: "warning",
      message: `Pages ${emptyPages.join(", ")} have no extractable text and may be scanned or image-only.`,
    });
  issues.push(...validateFoundation(report));
  return { ok: !issues.some((issue) => issue.severity === "error"), report, issues };
}
export function parseExtractedPdfText(text: string, fileName = "Imported PDF"): PdfImportResult {
  const lines = text.split(/\r?\n/).map(clean).filter(Boolean);
  if (!lines.length)
    return {
      ok: false,
      issues: [{ severity: "error", message: "PDF contains no extractable text." }],
    };
  const sections: ReportSection[] = [];
  const title = lines.find((line) => /report/i.test(line)) ?? fileName.replace(/\.pdf$/i, "");
  let currentTitle = "Imported commentary";
  let content: string[] = [];
  const flush = () => {
    if (!content.length) return;
    const table = delimitedTable(content);
    sections.push({
      id: `${slug(currentTitle)}-${sections.length + 1}`,
      type: reportType(currentTitle),
      title: currentTitle,
      data: table ? { table } : { text: content.join("\n") },
    });
    content = [];
  };
  for (const line of lines) {
    if (
      /^\d{1,2}[.)]?\s+(?:Executive|Market|Economic|Technical|Fundamental|Trading|Risk|Sources|Methodology)/i.test(
        line,
      ) ||
      /^(?:Market dashboard|Economic calendar|Trading scenarios|Risk disclosure)$/i.test(line)
    ) {
      flush();
      currentTitle = line.replace(/^\d{1,2}[.)]?\s+/, "");
    } else if (
      line !== title &&
      !/^\d{1,2}\s+(?:January|February|March|April|May|June|July|August|September|October|November|December)\s+20\d{2}$/i.test(
        line,
      )
    )
      content.push(line);
  }
  flush();
  if (!sections.length)
    sections.push({
      id: "imported-commentary-1",
      type: "paragraph",
      title: "Imported commentary",
      data: { text: lines.join("\n") },
    });
  const report: CanonicalReport = {
    schemaVersion: "1.0",
    id: `pdf-${Date.now()}`,
    date: dateFrom(text),
    sourceLocale: "en",
    locale: "en",
    metadata: { title, edition: "PDF import" },
    sourcePages: [{ pageNumber: 1, text }],
    sections,
  };
  const issues: ValidationIssue[] = [
    {
      severity: "warning",
      message:
        "Text-only PDF import has no layout coordinates; review structure before publishing.",
    },
    ...validateFoundation(report),
  ];
  if (sections.length === 1 && currentTitle === "Imported commentary")
    issues.push({
      severity: "warning",
      message: "No supported report headings were detected; content was imported as commentary.",
    });
  return { ok: true, report, issues };
}
export async function extractPdfText(data: ArrayBuffer): Promise<PdfExtractionResult> {
  const loadingTask = getDocument({ data: new Uint8Array(data) });
  const pdf = await loadingTask.promise;
  const layout: PdfPage[] = [];
  try {
    for (let pageNumber = 1; pageNumber <= pdf.numPages; pageNumber += 1) {
      const page = await pdf.getPage(pageNumber);
      const viewport = page.getViewport({ scale: 1 });
      const content = await page.getTextContent();
      const spans: PdfSpan[] = content.items
        .filter((item) => "str" in item)
        .map((item) => ({
          text: item.str,
          x: item.transform[4],
          y: item.transform[5],
          width: item.width,
          height: item.height,
        }));
      const lines = linesFromSpans(spans);
      layout.push({
        pageNumber,
        width: viewport.width,
        height: viewport.height,
        lines,
        text: lines.map((line) => line.text).join("\n"),
      });
    }
  } finally {
    await loadingTask.destroy();
  }
  const pages = layout.map((page) => page.text);
  return { pages, text: pages.join("\n\n"), layout };
}
export async function parsePdfFile(file: File): Promise<PdfImportResult> {
  try {
    const extraction = await extractPdfText(await file.arrayBuffer());
    const parsed = mapPdfPages(extraction.layout ?? [], file.name);
    if (parsed.report && typeof document !== "undefined") {
      try {
        const loadingTask = getDocument({ data: new Uint8Array(await file.arrayBuffer()) });
        const pdf = await loadingTask.promise;
        try {
          for (const source of extraction.layout ?? []) {
            if (source.pageNumber === 1) continue;
            const lines = source.lines.filter(
              (line) => line.y < source.height * 0.92 && line.y > source.height * 0.08,
            );
            const gaps = lines
              .slice(0, -1)
              .map((line, index) => ({
                upper: line.y,
                lower: lines[index + 1]!.y,
                context: `${line.text} ${lines[index + 1]!.text}`,
              }))
              .filter((gap) => gap.upper - gap.lower > 140 && gap.lower > source.height * 0.12);
            if (!gaps.length) continue;
            const page = await pdf.getPage(source.pageNumber);
            const viewport = page.getViewport({ scale: 1.25 });
            const canvas = document.createElement("canvas");
            canvas.width = Math.ceil(viewport.width);
            canvas.height = Math.ceil(viewport.height);
            const context = canvas.getContext("2d");
            if (!context) continue;
            await page.render({ canvasContext: context, canvas, viewport }).promise;
            for (const gap of gaps) {
              const x = Math.round(source.width * 0.06 * 1.25);
              const y = Math.round((source.height - gap.upper + 8) * 1.25);
              const width = Math.round(source.width * 0.88 * 1.25);
              const height = Math.round((gap.upper - gap.lower - 16) * 1.25);
              if (height <= 0) continue;
              const crop = document.createElement("canvas");
              crop.width = width;
              crop.height = height;
              crop.getContext("2d")?.drawImage(canvas, x, y, width, height, 0, 0, width, height);
              const imageUrl = crop.toDataURL("image/png");
              const index = parsed.report.sections.findIndex(
                (section) => section.data.sourcePage === source.pageNumber,
              );
              const insertion =
                index < 0
                  ? parsed.report.sections.length
                  : parsed.report.sections.findIndex(
                      (section, current) =>
                        current > index && section.data.sourcePage !== source.pageNumber,
                    );
              const destination = insertion < 0 ? parsed.report.sections.length : insertion;
              parsed.report.sections.splice(destination, 0, {
                id: `source-visual-${source.pageNumber}-${destination}`,
                type: "chart",
                title: `Source visual · page ${source.pageNumber}`,
                data: {
                  sourcePage: source.pageNumber,
                  imageUrl,
                  caption: "Visual captured from the imported PDF; review before publishing.",
                },
              });
            }
          }
        } finally {
          await loadingTask.destroy();
        }
      } catch {
        parsed.issues.push({
          severity: "warning",
          message:
            "Some page visuals could not be captured; compare the source PDF before publishing.",
        });
      }
    }
    return { ...parsed, extraction };
  } catch (error) {
    return {
      ok: false,
      issues: [
        {
          severity: "error",
          message: `PDF could not be read: ${error instanceof Error ? error.message : "unknown PDF error"}`,
        },
      ],
    };
  }
}
