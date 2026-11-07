import { z } from "zod";

export const sectionTypes = [
  "cover",
  "heading",
  "paragraph",
  "dashboard",
  "economic-calendar",
  "technical-analysis",
  "fundamental-analysis",
  "scenario",
  "bias-matrix",
  "chart",
  "sources",
  "methodology",
  "risk-disclosure",
  "unknown",
] as const;
export type SectionType = (typeof sectionTypes)[number];
export const knownSectionTypes = sectionTypes.filter((type) => type !== "unknown") as Exclude<
  SectionType,
  "unknown"
>[];
export type KnownSectionType = (typeof knownSectionTypes)[number];
export type Locale = "en" | "es" | "ar";
export type Cell = string | number;
export interface TableData {
  columns: { key: string; label: string }[];
  rows: Record<string, Cell>[];
}
export interface SectionData {
  text?: string;
  kicker?: string;
  sourcePage?: number;
  translatedTextLength?: number;
  fontScale?: number;
  table?: TableData;
  instrument?: string;
  bias?: string;
  reference?: string;
  support?: string;
  resistance?: string;
  bullish?: string;
  bearish?: string;
  caption?: string;
  imageUrl?: string;
  chartUrl?: string;
  original?: unknown;
  unknownType?: string;
}
export interface ReportSection {
  id: string;
  type: SectionType;
  title: string;
  data: SectionData;
}
export interface CanonicalReport {
  schemaVersion: "1.0";
  id: string;
  date: string;
  sourceLocale: Locale;
  locale: Locale;
  metadata: {
    title: string;
    edition: string;
    brandName?: string | undefined;
    [key: string]: unknown;
  };
  sourcePages?: { pageNumber: number; text: string }[] | undefined;
  // The original extractor payload is retained verbatim when importing a PDF-layout JSON file.
  // It is deliberately not rendered or translated, so editor actions cannot silently alter it.
  sourceLayout?: unknown;
  sections: ReportSection[];
}
export interface ValidationIssue {
  severity: "error" | "warning" | "info";
  message: string;
  sectionId?: string;
  path?: string;
}

export interface ReportTextStats {
  characters: number;
  words: number;
}

export function calculateSectionTextStats(section: ReportSection): ReportTextStats {
  const values: string[] = [];
  if (section.type !== "cover") values.push(section.title);
  for (const field of ["text", "caption", "bullish", "bearish"] as const) {
    const value = section.data[field];
    if (value) values.push(value);
  }
  if (section.data.table) {
    values.push(...section.data.table.columns.map((column) => column.label));
    values.push(
      ...section.data.table.rows.flatMap((row) =>
        section.data.table!.columns.map((column) => String(row[column.key] ?? "")),
      ),
    );
  }
  return values.reduce(
    (stats, value) => ({
      characters: stats.characters + Array.from(value).length,
      words: stats.words + (value.match(/[\p{L}\p{N}]+(?:['’][\p{L}\p{N}]+)*/gu)?.length ?? 0),
    }),
    { characters: 0, words: 0 },
  );
}

/** Counts only text rendered in the report, excluding import provenance and raw source payloads. */
export function calculateReportTextStats(report: CanonicalReport): ReportTextStats {
  return report.sections.reduce(
    (stats, section) => {
      const sectionStats = calculateSectionTextStats(section);
      return {
        characters: stats.characters + sectionStats.characters,
        words: stats.words + sectionStats.words,
      };
    },
    { characters: 0, words: 0 },
  );
}

const cellSchema = z.union([z.string(), z.number()]);
const tableSchema = z.object({
  columns: z.array(z.object({ key: z.string().min(1), label: z.string().min(1) })),
  rows: z.array(z.record(z.string(), cellSchema)),
});
const dataSchema = z
  .object({
    text: z.string().optional(),
    sourcePage: z.number().int().positive().optional(),
    translatedTextLength: z.number().int().nonnegative().optional(),
    fontScale: z.number().min(0.85).max(1.45).optional(),
    table: tableSchema.optional(),
    instrument: z.string().optional(),
    bias: z.string().optional(),
    reference: z.string().optional(),
    support: z.string().optional(),
    resistance: z.string().optional(),
    bullish: z.string().optional(),
    bearish: z.string().optional(),
    caption: z.string().optional(),
    imageUrl: z.string().url().optional(),
    chartUrl: z.string().url().optional(),
    original: z.unknown().optional(),
    unknownType: z.string().optional(),
  })
  .passthrough();
const rawSectionSchema = z.object({
  id: z.string().min(1, "section id is required"),
  type: z.string().min(1, "section type is required"),
  title: z.string(),
  data: dataSchema,
});
const rawReportSchema = z.object({
  schemaVersion: z.literal("1.0"),
  id: z.string().min(1),
  date: z.string(),
  sourceLocale: z.enum(["en", "es", "ar"]),
  locale: z.enum(["en", "es", "ar"]),
  metadata: z
    .object({ title: z.string(), edition: z.string(), brandName: z.string().optional() })
    .passthrough(),
  sourcePages: z
    .array(z.object({ pageNumber: z.number().int().positive(), text: z.string() }))
    .optional(),
  sourceLayout: z.unknown().optional(),
  sections: z.array(rawSectionSchema),
});

const layoutCellSchema = z.object({ text: z.string() }).passthrough();
const pdfLayoutSchema = z
  .object({
    schema: z.literal("pdf-layout-json"),
    schemaVersion: z.string().min(1),
    source: z.object({ name: z.string().min(1) }).passthrough(),
    metadata: z
      .object({ title: z.string().nullable().optional(), pageCount: z.number().int().positive() })
      .passthrough(),
    pages: z.array(
      z
        .object({
          pageNumber: z.number().int().positive(),
          width: z.number().positive(),
          height: z.number().positive(),
        })
        .passthrough(),
    ),
    textBlocks: z.array(
      z
        .object({
          id: z.string().min(1),
          page: z.number().int().positive(),
          text: z.string(),
          readingOrder: z.number().int(),
        })
        .passthrough(),
    ),
    tables: z
      .array(
        z
          .object({
            id: z.string().min(1),
            page: z.number().int().positive(),
            rows: z.array(z.array(layoutCellSchema)),
          })
          .passthrough(),
      )
      .default([]),
    warnings: z.array(z.string()).default([]),
    scenarios: z
      .array(
        z.object({
          page: z.number().int().positive(),
          bullishScenario: z.object({ text: z.string() }).optional(),
          bearishRiskScenario: z.object({ text: z.string() }).optional(),
        }),
      )
      .default([]),
    chartUrls: z
      .array(z.object({ page: z.number().int().positive(), url: z.string().url() }))
      .default([]),
  })
  .passthrough();

export interface ImportResult {
  ok: boolean;
  report?: CanonicalReport;
  issues: ValidationIssue[];
}

function formatZodIssues(error: z.ZodError): ValidationIssue[] {
  return error.issues.map((issue) => ({
    severity: "error",
    message: (issue.path.join(".") || "report") + ": " + issue.message,
    path: issue.path.join("."),
  }));
}

function normalizeSection(section: z.infer<typeof rawSectionSchema>): ReportSection {
  if (knownSectionTypes.includes(section.type as KnownSectionType)) {
    return {
      id: section.id,
      title: section.title,
      type: section.type as KnownSectionType,
      data: section.data as SectionData,
    };
  }
  return {
    id: section.id,
    type: "unknown",
    title: section.title || "Unknown section (" + section.type + ")",
    data: { original: section, unknownType: section.type },
  };
}

export function parseReportJson(input: unknown): ImportResult {
  const layout = pdfLayoutSchema.safeParse(input);
  if (layout.success) return mapPdfLayoutJson(layout.data, input);
  const parsed = rawReportSchema.safeParse(input);
  if (!parsed.success) return { ok: false, issues: formatZodIssues(parsed.error) };
  const report: CanonicalReport = {
    ...parsed.data,
    sections: parsed.data.sections.map(normalizeSection),
  };
  const issues = validateFoundation(report);
  const hasErrors = issues.some((issue) => issue.severity === "error");
  return hasErrors ? { ok: false, issues } : { ok: true, report, issues };
}

/** Rehydrates custom section types so a GTM download remains import-compatible. */
export function serializeCanonicalReport(report: CanonicalReport): CanonicalReport {
  return {
    ...report,
    sections: report.sections.map((section) => {
      if (section.type !== "unknown" || !section.data.unknownType || !section.data.original)
        return section;
      const original = section.data.original;
      if (!original || typeof original !== "object" || Array.isArray(original)) return section;
      const source = original as Record<string, unknown>;
      return {
        ...section,
        type: section.data.unknownType,
        data: source["data"] ?? section.data,
      } as ReportSection;
    }),
  };
}

function layoutTableType(labels: string[]): KnownSectionType {
  const joined = labels.join(" ");
  if (/impact|currency|date|time|event/i.test(joined)) return "economic-calendar";
  if (/asset|main driver|daily bias/i.test(joined)) return "dashboard";
  if (/bias|matrix/i.test(joined)) return "bias-matrix";
  return "technical-analysis";
}

function uniqueColumnKey(label: string, index: number, used: Set<string>): string {
  const base =
    label
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-|-$/g, "") || `column-${index + 1}`;
  let key = base;
  let suffix = 2;
  while (used.has(key)) key = `${base}-${suffix++}`;
  used.add(key);
  return key;
}

/**
 * Maps a coordinate-oriented PDF extraction into editable canonical sections.
 * The input object is also retained unchanged in sourceLayout for audit/export use.
 */
function mapPdfLayoutJson(
  layout: z.infer<typeof pdfLayoutSchema>,
  original: unknown,
): ImportResult {
  const blocksByPage = new Map<number, typeof layout.textBlocks>();
  for (const block of layout.textBlocks) {
    const blocks = blocksByPage.get(block.page) ?? [];
    blocks.push(block);
    blocksByPage.set(block.page, blocks);
  }
  const sourcePages = layout.pages.map((page) => ({
    pageNumber: page.pageNumber,
    text: (blocksByPage.get(page.pageNumber) ?? [])
      .slice()
      .sort((a, b) => a.readingOrder - b.readingOrder)
      .map((block) => block.text)
      .filter(Boolean)
      .join("\n"),
  }));
  const firstText = sourcePages[0]?.text.split("\n").find((text) => text.trim());
  const title =
    firstText || layout.metadata.title?.trim() || layout.source.name.replace(/\.pdf$/i, "");
  const dateMatch = `${layout.source.name}\n${sourcePages[0]?.text ?? ""}`.match(
    /20\d{2}-\d{2}-\d{2}/,
  );
  const date = dateMatch ? dateMatch[0] : new Date().toISOString().slice(0, 10);
  const brandName = sourcePages[0]?.text.match(/prepared\s+by\s+([^\n]+)/i)?.[1]?.trim();
  const tableSections = new Map<number, ReportSection[]>();
  for (const layoutTable of layout.tables) {
    const [header = [], ...body] = layoutTable.rows;
    if (!header.length) continue;
    const used = new Set<string>();
    const columns = header.map((cell, index) => ({
      key: uniqueColumnKey(cell.text, index, used),
      label: cell.text || `Column ${index + 1}`,
    }));
    const table = {
      columns,
      rows: body.map((row) =>
        Object.fromEntries(columns.map((column, index) => [column.key, row[index]?.text ?? ""])),
      ),
    };
    const labels = columns.map((column) => column.label);
    const type = layoutTableType(labels);
    const tableSection: ReportSection = {
      id: layoutTable.id,
      type,
      title:
        type === "dashboard"
          ? "Market Dashboard"
          : type === "economic-calendar"
            ? "Economic Calendar & Market Overview"
            : type === "bias-matrix"
              ? "Daily Bias Matrix"
              : "Key Levels",
      data: { sourcePage: layoutTable.page, table, original: layoutTable },
    };
    tableSections.set(layoutTable.page, [
      ...(tableSections.get(layoutTable.page) ?? []),
      tableSection,
    ]);
  }
  const cleanNarrative = (pageNumber: number, start: RegExp, end?: RegExp) => {
    const text = sourcePages.find((page) => page.pageNumber === pageNumber)?.text ?? "";
    const lines = text.split(/\n/);
    const startIndex = lines.findIndex((line) => start.test(line));
    const endIndex = end
      ? lines.findIndex((line, index) => index > startIndex && end.test(line))
      : -1;
    return lines
      .slice(startIndex < 0 ? 0 : startIndex + 1, endIndex < 0 ? undefined : endIndex)
      .filter(
        (line) =>
          !/^(GLOBAL TREND MARKETS|Daily Market Report|Daily Market Analysis|Market information only|\d{2})$/i.test(
            line,
          ),
      )
      .filter(
        (line) =>
          !/^(Asset|Main Driver|Daily Bias|Price \/ Reference|Impact|Event|Currency|Cyprus Time|Date|Key Levels|Bias)$/i.test(
            line,
          ),
      )
      .join("\n")
      .trim();
  };
  const sections: ReportSection[] = [];
  const add = (section: ReportSection) => sections.push(section);
  const scenariosByPage = new Map(layout.scenarios.map((scenario) => [scenario.page, scenario]));
  const chartUrlsByPage = new Map(layout.chartUrls.map((chart) => [chart.page, chart.url]));
  for (const page of sourcePages) {
    const pageTables = tableSections.get(page.pageNumber) ?? [];
    if (page.pageNumber === 1) {
      add({
        id: "cover",
        type: "cover",
        title: "Cover",
        data: {
          text: title,
          caption:
            page.text.split("\n").find((line) => /^prepared\s+by\b/i.test(line.trim())) ?? "",
          sourcePage: 1,
        },
      });
    } else if (page.pageNumber === 2) {
      add({
        id: "executive-market-view",
        type: "paragraph",
        title: "Executive Market View",
        data: {
          text: cleanNarrative(2, /Executive Market View/i, /Market Dashboard|Economic Calendar/i),
          sourcePage: 2,
        },
      });
      pageTables.forEach(add);
    } else if (page.pageNumber === 3) {
      add({
        id: "market-overview",
        type: "paragraph",
        title: "Market Overview",
        data: { text: cleanNarrative(3, /MARKET OVERVIEW/i), sourcePage: 3 },
      });
    } else if (page.pageNumber >= 4 && page.pageNumber <= 11) {
      const lines = page.text.split("\n");
      const instrument =
        lines.find((line) =>
          /^(EUR\/USD|GBP\/USD|USD\/JPY|XAU\/USD|XAG\/USD|US OIL|US30|NASDAQ)/i.test(line),
        ) ?? `Market analysis ${page.pageNumber}`;
      const levels = pageTables[0];
      const chartUrl = chartUrlsByPage.get(page.pageNumber);
      if (levels) add({ ...levels, title: instrument, type: "dashboard" });
      add({
        id: `chart-page-${page.pageNumber}`,
        type: "chart",
        title: "TradingView live chart",
        data: chartUrl
          ? { sourcePage: page.pageNumber, chartUrl }
          : { sourcePage: page.pageNumber },
      });
      add({
        id: `fundamental-page-${page.pageNumber}`,
        type: "fundamental-analysis",
        title: "Fundamental View",
        data: {
          text: cleanNarrative(page.pageNumber, /Fundamental View/i, /BULLISH SCENARIO|BEARISH/i),
          sourcePage: page.pageNumber,
        },
      });
      const extractedScenario = scenariosByPage.get(page.pageNumber);
      const scenario = pageTables[1];
      if (extractedScenario || scenario) {
        const row = scenario?.data.table?.rows[0];
        const [bullishKey, bearishKey] =
          scenario?.data.table?.columns.map((column) => column.key) ?? [];
        add({
          id: `scenario-page-${page.pageNumber}`,
          type: "scenario",
          title: "Trading scenarios",
          data: {
            sourcePage: page.pageNumber,
            bullish:
              extractedScenario?.bullishScenario?.text ?? String(row?.[bullishKey ?? ""] ?? ""),
            bearish:
              extractedScenario?.bearishRiskScenario?.text ?? String(row?.[bearishKey ?? ""] ?? ""),
            original: extractedScenario ?? scenario?.data.original,
          },
        });
      }
    } else if (page.pageNumber === 12) {
      pageTables.forEach(add);
      add({
        id: "next-major-catalyst",
        type: "paragraph",
        title: "Next major catalyst",
        data: { text: cleanNarrative(12, /NEXT MAJOR CATALYST/i), sourcePage: 12 },
      });
    } else if (page.pageNumber === 13) {
      add({
        id: "methodology",
        type: "methodology",
        title: "Methodology",
        data: { text: cleanNarrative(13, /METHODOLOGY/i, /RISK DISCLAIMER/i), sourcePage: 13 },
      });
      add({
        id: "risk-disclosure",
        type: "risk-disclosure",
        title: "Risk disclaimer",
        data: { text: cleanNarrative(13, /RISK DISCLAIMER/i), sourcePage: 13 },
      });
    }
  }
  const report: CanonicalReport = {
    schemaVersion: "1.0",
    id: `layout-${layout.source.name
      .replace(/[^a-z0-9]+/gi, "-")
      .replace(/^-|-$/g, "")
      .toLowerCase()}`,
    date,
    sourceLocale: "en",
    locale: "en",
    metadata: { title, edition: "PDF layout import", ...(brandName ? { brandName } : {}) },
    sourcePages,
    sourceLayout: original,
    sections,
  };
  const issues: ValidationIssue[] = [
    {
      severity: "warning",
      message:
        "PDF layout JSON was converted to editable sections. The complete original layout payload is retained in sourceLayout; review heuristic tables and reading order before publishing.",
    },
    ...layout.warnings.map((message) => ({ severity: "warning" as const, message })),
    ...validateFoundation(report),
  ];
  return { ok: !issues.some((issue) => issue.severity === "error"), report, issues };
}

export function parseReportJsonText(text: string): ImportResult {
  try {
    return parseReportJson(JSON.parse(text) as unknown);
  } catch (error) {
    return {
      ok: false,
      issues: [
        {
          severity: "error",
          message:
            "JSON file could not be parsed: " +
            (error instanceof Error ? error.message : "invalid JSON"),
        },
      ],
    };
  }
}

export function rebrandReport(report: CanonicalReport, brandName: string): CanonicalReport {
  const old = report.metadata.brandName?.trim();
  if (!old || old === brandName) return { ...report, metadata: { ...report.metadata, brandName } };
  const pattern = new RegExp(old.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "gi");
  const replace = (value: string) =>
    value.replace(pattern, (match) =>
      match === match.toUpperCase() ? brandName.toUpperCase() : brandName,
    );
  return {
    ...report,
    metadata: { ...report.metadata, brandName },
    sections: report.sections.map((section) => ({
      ...section,
      title: replace(section.title),
      data: {
        ...section.data,
        ...Object.fromEntries(
          (["text", "caption", "bullish", "bearish"] as const)
            .filter((key) => typeof section.data[key] === "string")
            .map((key) => [key, replace(section.data[key] as string)]),
        ),
        ...(section.data.table
          ? {
              table: {
                columns: section.data.table.columns.map((column) => ({
                  ...column,
                  label: replace(column.label),
                })),
                rows: section.data.table.rows.map((row) =>
                  Object.fromEntries(
                    Object.entries(row).map(([key, value]) => [
                      key,
                      typeof value === "string" ? replace(value) : value,
                    ]),
                  ),
                ),
              },
            }
          : {}),
      },
    })),
  };
}

export function validateFoundation(report: CanonicalReport): ValidationIssue[] {
  const issues: ValidationIssue[] = [];
  if (!report.metadata.title.trim()) {
    issues.push({ severity: "error", message: "Report metadata.title is required." });
  }
  if (report.metadata.brandName !== undefined && !report.metadata.brandName.trim()) {
    issues.push({ severity: "error", message: "Report metadata.brandName cannot be empty." });
  }
  if (
    !/^\d{4}-\d{2}-\d{2}$/.test(report.date) ||
    Number.isNaN(Date.parse(report.date)) ||
    new Date(report.date).toISOString().slice(0, 10) !== report.date
  ) {
    issues.push({
      severity: "error",
      message: "Report date '" + report.date + "' is not a valid ISO date.",
    });
  }
  const ids = new Set<string>();
  for (const section of report.sections) {
    if (ids.has(section.id)) {
      issues.push({
        severity: "error",
        message: "Duplicate section id '" + section.id + "'.",
        sectionId: section.id,
      });
    }
    ids.add(section.id);
    if (!section.title.trim()) {
      issues.push({
        severity: "warning",
        message: "Section '" + section.id + "' has an empty title.",
        sectionId: section.id,
      });
    }
    if (section.type === "chart" && !section.data.imageUrl && !section.data.chartUrl) {
      issues.push({
        severity: "warning",
        message: "Chart image is not attached.",
        sectionId: section.id,
      });
    }
    if (section.type === "unknown") {
      issues.push({
        severity: "warning",
        message:
          "Unknown section type '" +
          (section.data.unknownType ?? "unknown") +
          "' was preserved for review.",
        sectionId: section.id,
      });
    }
    if (section.data.table) {
      const { columns, rows } = section.data.table;
      const keys = new Set<string>();
      const duplicateColumn = columns.find((column) => keys.has(column.key));
      columns.forEach((column) => keys.add(column.key));
      if (!columns.length) {
        issues.push({
          severity: "error",
          message: "Section '" + section.id + "' table has no columns.",
          sectionId: section.id,
        });
      }
      if (duplicateColumn) {
        issues.push({
          severity: "error",
          message:
            "Section '" + section.id + "' table repeats column '" + duplicateColumn.key + "'.",
          sectionId: section.id,
        });
      }
      const missing = rows.flatMap((row, rowIndex) =>
        columns
          .filter((column) => !(column.key in row))
          .map((column) => "row " + (rowIndex + 1) + " missing '" + column.key + "'"),
      );
      if (missing.length) {
        issues.push({
          severity: "error",
          message: "Section '" + section.id + "' table: " + missing.join(", ") + ".",
          sectionId: section.id,
        });
      }
    }
  }
  return issues;
}

export function estimateSectionWeight(section: ReportSection): number {
  const textLength = Math.max(
    section.data.text?.length ?? 0,
    section.data.translatedTextLength ?? 0,
  );
  return section.type === "cover"
    ? 240
    : section.data.table
      ? 90 + section.data.table.rows.length * 35
      : section.type === "chart"
        ? 300
        : 100 + Math.ceil(textLength / 95) * 18;
}

// Editorial pagination uses content weight and leaves oversized blocks alone so
// the browser can flow them across print pages instead of clipping them.
export function paginateSections(
  sections: ReportSection[],
  pageCapacity = 740,
  isolateCover = true,
): ReportSection[][] {
  const pages: ReportSection[][] = [];
  let page: ReportSection[] = [];
  let weight = 0;
  for (const section of sections) {
    const amount = estimateSectionWeight(section);
    if (
      page.length &&
      (section.type === "cover" ||
        (isolateCover && page.some((item) => item.type === "cover")) ||
        weight + amount > pageCapacity ||
        section.type === "technical-analysis" ||
        section.type === "sources")
    ) {
      pages.push(page);
      page = [];
      weight = 0;
    }
    page.push(section);
    weight += amount;
  }
  if (page.length) pages.push(page);
  return pages;
}

export const groupPages = paginateSections;

// PDF-layout imports carry source-page provenance. Keeping those editorial groups together
// makes the GTM canvas follow the reference report without claiming measured print pagination.
export function groupSourcePages(sections: ReportSection[]): ReportSection[][] {
  const groups: ReportSection[][] = [];
  let currentPage: number | undefined;
  for (const section of sections) {
    const sourcePage = section.data.sourcePage;
    if (sourcePage === undefined) return paginateSections(sections);
    if (sourcePage !== currentPage) {
      groups.push([]);
      currentPage = sourcePage;
    }
    groups.at(-1)?.push(section);
  }
  return groups;
}
