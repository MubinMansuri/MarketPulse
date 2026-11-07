"use client";

import { useEffect, useMemo, useRef, useState, type ChangeEvent, type CSSProperties } from "react";
import {
  ArrowDown,
  ArrowUp,
  Check,
  CheckCircle2,
  ChevronDown,
  Circle,
  Copy,
  Download,
  Eye,
  FileText,
  Globe2,
  GripVertical,
  Minus,
  Plus,
  Redo2,
  Settings2,
  ShieldCheck,
  Trash2,
  Undo2,
  Upload,
  AlertCircle,
  PanelLeftClose,
  PanelRightClose,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { sampleReport } from "./sample-report";
import gtmCanonicalSampleJson from "../../../gtm-canonical-report.sample.json";
import {
  calculateReportTextStats,
  calculateSectionTextStats,
  paginateSections,
  groupSourcePages,
  validateFoundation,
  parseReportJsonText,
  rebrandReport,
  serializeCanonicalReport,
  type CanonicalReport,
  type ImportResult,
  type ReportSection,
  type SectionType,
  type ValidationIssue,
} from "./model";
import {
  EditableText,
  ReportBackCover,
  ReportBlock,
  ReportHeading,
  ReportPage,
} from "./report-blocks";
import { getUiLabels, isRtlLocale, localeNames } from "./locale";
import {
  createTranslationAdapter,
  type TranslationRequest,
  type TranslationResponse,
} from "./translation";
import { brand } from "./brand";

const ESTIMATED_PAGE_HEIGHT = 1_040;
const VIRTUAL_PAGE_BUFFER = 2;

async function requestTranslation<T>(endpoint: string, payload: unknown): Promise<T> {
  const response = await fetch(endpoint, {
    method: "POST",
    credentials: "same-origin",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(payload),
  });
  if (!response.ok) {
    const body = (await response.json().catch(() => null)) as { error?: unknown } | null;
    throw new Error(
      typeof body?.error === "string" ? body.error : "Translation service could not be reached.",
    );
  }
  return response.json() as Promise<T>;
}

function translateSingle(request: TranslationRequest): Promise<TranslationResponse> {
  return requestTranslation<TranslationResponse>("/api/translate", request);
}

function translateBatch(requests: TranslationRequest[]): Promise<TranslationResponse[]> {
  return requestTranslation<TranslationResponse[]>("/api/translate/batch", { requests });
}

function normalizeReportDateForFileName(date: string) {
  if (/^\d{4}-\d{2}-\d{2}$/.test(date)) return date;
  const europeanDate = date.match(/^(\d{2})-(\d{2})-(\d{4})$/);
  return europeanDate ? `${europeanDate[3]}-${europeanDate[2]}-${europeanDate[1]}` : date;
}

function getGtmPdfBaseName(date: string, locale: CanonicalReport["locale"]) {
  const languageSuffix = locale === "en" ? "" : `_${locale === "ar" ? "ae" : locale}`;
  return `GTM_Daily_Market_Report_${normalizeReportDateForFileName(date)}${languageSuffix}`;
}

function parseJsonOffMainThread(text: string): Promise<ImportResult> {
  if (typeof Worker === "undefined") return Promise.resolve(parseReportJsonText(text));
  return new Promise((resolve, reject) => {
    const worker = new Worker(new URL("./json-import.worker.ts", import.meta.url), {
      type: "module",
    });
    worker.onmessage = ({ data }: MessageEvent<{ result: ImportResult }>) => {
      worker.terminate();
      resolve(data.result);
    };
    worker.onerror = () => {
      worker.terminate();
      reject(new Error("JSON import worker could not process this file."));
    };
    worker.postMessage({ text });
  });
}

export function ReportEditor() {
  const [report, setReport] = useState<CanonicalReport>(() => structuredClone(sampleReport));
  const [englishSourceReport, setEnglishSourceReport] = useState<CanonicalReport | null>(() =>
    structuredClone(sampleReport),
  );
  const [isSample, setIsSample] = useState(true);
  const [history, setHistory] = useState<CanonicalReport[]>([]);
  const [future, setFuture] = useState<CanonicalReport[]>([]);
  const [selectedId, setSelectedId] = useState("overview");
  const [preview, setPreview] = useState(false);
  const [zoom, setZoom] = useState(85);
  const [theme, setTheme] = useState<"gtm" | "classic">("classic");
  const [addOpen, setAddOpen] = useState(false);
  const [newType, setNewType] = useState<SectionType>("paragraph");
  const [leftOpen, setLeftOpen] = useState(true);
  const [rightOpen, setRightOpen] = useState(true);
  const [mobilePanel, setMobilePanel] = useState<"sections" | "properties" | null>(null);
  const [pendingImport, setPendingImport] = useState<CanonicalReport | null>(null);
  const [importIssues, setImportIssues] = useState<ValidationIssue[]>([]);
  const [importFileName, setImportFileName] = useState("");
  const [exportOpen, setExportOpen] = useState(false);
  const [supportedJsonOpen, setSupportedJsonOpen] = useState(false);
  const [exportBusy, setExportBusy] = useState(false);
  const [renderAllPages, setRenderAllPages] = useState(false);
  const [exportError, setExportError] = useState("");
  const [interfaceLocale, setInterfaceLocale] = useState<CanonicalReport["locale"]>("en");
  const [targetLocale, setTargetLocale] = useState<Exclude<CanonicalReport["locale"], "en">>("es");
  const [translationBusy, setTranslationBusy] = useState(false);
  const [translationComplete, setTranslationComplete] = useState(false);
  const [translationIssues, setTranslationIssues] = useState<ValidationIssue[]>([]);
  const [textStats, setTextStats] = useState(() => calculateReportTextStats(sampleReport));
  const [virtualRange, setVirtualRange] = useState({ start: 0, end: 2 });
  const reportRef = useRef(report);
  const historyRef = useRef(history);
  const futureRef = useRef(future);
  const canvasRef = useRef<HTMLElement>(null);
  const pendingScrollId = useRef<string | null>(null);
  const scrollFrame = useRef<number | null>(null);
  useEffect(() => {
    reportRef.current = report;
  }, [report]);
  useEffect(() => {
    historyRef.current = history;
  }, [history]);
  useEffect(() => {
    futureRef.current = future;
  }, [future]);
  const ui = getUiLabels(interfaceLocale);
  const publicationBrand = report.metadata.brandName ?? brand.name;
  const selected = report.sections.find((s) => s.id === selectedId);
  const pages = useMemo(
    () =>
      theme === "gtm" && report.sourceLayout
        ? groupSourcePages(report.sections)
        : paginateSections(report.sections, 740, theme === "gtm"),
    [report.sections, report.sourceLayout, theme],
  );
  const issues = validateFoundation(report);
  const errors = issues.filter((i) => i.severity === "error");
  const publicationPageCount = pages.length + (theme === "gtm" ? 1 : 0);
  const pageOffsets = useMemo(
    () => Array.from({ length: pages.length + 1 }, (_, index) => index * ESTIMATED_PAGE_HEIGHT),
    [pages.length],
  );
  // Mounting a complex editable page while the user scrolls is more expensive than
  // painting this normal-size report. Virtualize only documents large enough for it
  // to provide a net benefit.
  const shouldVirtualize = pages.length > 24;
  const renderedRange =
    renderAllPages || !shouldVirtualize
      ? { start: 0, end: Math.max(0, pages.length - 1) }
      : virtualRange;
  function updateVirtualRange() {
    if (!shouldVirtualize) return;
    const canvas = canvasRef.current;
    if (!canvas || !pages.length) return;
    const viewportTop = canvas.scrollTop;
    const viewportBottom = viewportTop + canvas.clientHeight;
    const firstVisible = Math.max(0, pageOffsets.findIndex((offset) => offset > viewportTop) - 1);
    const lastVisible = Math.max(
      firstVisible,
      pageOffsets.findIndex((offset) => offset >= viewportBottom) === -1
        ? pages.length - 1
        : pageOffsets.findIndex((offset) => offset >= viewportBottom),
    );
    const next = {
      start: Math.max(0, firstVisible - VIRTUAL_PAGE_BUFFER),
      end: Math.min(pages.length - 1, lastVisible + VIRTUAL_PAGE_BUFFER),
    };
    setVirtualRange((current) =>
      current.start === next.start && current.end === next.end ? current : next,
    );
  }
  useEffect(() => {
    updateVirtualRange();
    // The range must update when page count changes; the handler intentionally
    // reads the current render's geometry without re-subscribing on scroll state.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pages.length]);
  useEffect(() => {
    const id = pendingScrollId.current;
    if (!id) return;
    const target = document.getElementById(`block-${id}`);
    if (target) {
      pendingScrollId.current = null;
      target.scrollIntoView({ behavior: "smooth", block: "center" });
    }
  }, [virtualRange]);
  function handleCanvasScroll() {
    if (!shouldVirtualize) return;
    if (scrollFrame.current !== null) return;
    scrollFrame.current = requestAnimationFrame(() => {
      scrollFrame.current = null;
      updateVirtualRange();
    });
  }
  function update(next: CanonicalReport, nextTextStats = calculateReportTextStats(next)) {
    const nextHistory = [...historyRef.current.slice(-49), reportRef.current];
    historyRef.current = nextHistory;
    futureRef.current = [];
    reportRef.current = next;
    setHistory(nextHistory);
    setFuture([]);
    setReport(next);
    setTextStats(nextTextStats);
    if (next.locale === "en") setEnglishSourceReport(next);
  }
  function updateSection(section: ReportSection) {
    const previous = report.sections.find((item) => item.id === section.id);
    const previousStats = previous
      ? calculateSectionTextStats(previous)
      : { characters: 0, words: 0 };
    const sectionStats = calculateSectionTextStats(section);
    update(
      {
        ...report,
        sections: report.sections.map((s) => (s.id === section.id ? section : s)),
      },
      {
        characters: textStats.characters - previousStats.characters + sectionStats.characters,
        words: textStats.words - previousStats.words + sectionStats.words,
      },
    );
  }
  async function handleReportImport(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file) return;
    setImportFileName(file.name);
    setPendingImport(null);
    if (file.size > 20 * 1024 * 1024) {
      setImportIssues([{ severity: "error", message: "Import files must be 20 MB or smaller." }]);
      return;
    }
    try {
      const result =
        file.type === "application/pdf" || file.name.toLowerCase().endsWith(".pdf")
          ? await import("./pdf-import").then(({ parsePdfFile }) => parsePdfFile(file))
          : await parseJsonOffMainThread(await file.text());
      setImportIssues(result.issues);
      setPendingImport(result.ok ? (result.report ?? null) : null);
    } catch (error) {
      setImportIssues([
        {
          severity: "error",
          message: error instanceof Error ? error.message : "The import could not be read.",
        },
      ]);
    }
  }
  function confirmImport() {
    if (!pendingImport) return;
    reportRef.current = pendingImport;
    historyRef.current = [];
    futureRef.current = [];
    setReport(pendingImport);
    setTextStats(calculateReportTextStats(pendingImport));
    setEnglishSourceReport(pendingImport.locale === "en" ? structuredClone(pendingImport) : null);
    setIsSample(false);
    setHistory([]);
    setFuture([]);
    setSelectedId(pendingImport.sections[0]?.id ?? "");
    setVirtualRange({ start: 0, end: 2 });
    canvasRef.current?.scrollTo({ top: 0 });
    setPendingImport(null);
    setImportIssues([]);
  }
  async function translateReport() {
    if (!englishSourceReport) {
      setTranslationIssues([
        {
          severity: "warning",
          message: "Translation requires an English source report.",
        },
      ]);
      return;
    }
    setTranslationBusy(true);
    setTranslationComplete(false);
    setTranslationIssues([]);
    try {
      const adapter = createTranslationAdapter(
        targetLocale,
        (request) => translateSingle(request),
        undefined,
        translateBatch,
      );
      const result = await adapter.translateReport(englishSourceReport);
      if (result.ok && result.report) {
        const nextHistory = [...historyRef.current.slice(-49), reportRef.current];
        historyRef.current = nextHistory;
        futureRef.current = [];
        reportRef.current = result.report;
        setHistory(nextHistory);
        setFuture([]);
        setReport(result.report);
        setTextStats(calculateReportTextStats(result.report));
        setTranslationIssues(result.issues);
        setTranslationComplete(true);
      } else {
        setTranslationIssues(result.issues);
      }
    } catch (error) {
      setTranslationIssues([
        {
          severity: "warning",
          message: error instanceof Error ? error.message : ui.translationUnavailable,
        },
      ]);
    } finally {
      setTranslationBusy(false);
    }
  }
  async function waitForPrintAssets(root: HTMLElement) {
    if (document.fonts?.ready) await document.fonts.ready;
    const images = Array.from(root.querySelectorAll("img"));
    await Promise.all(
      images.map(
        (image) =>
          new Promise<void>((resolve, reject) => {
            const finish = () => {
              if (image.naturalWidth > 0) resolve();
              else reject(new Error(`Image failed to load: ${image.currentSrc || image.src}`));
            };
            if (image.complete) finish();
            else {
              image.addEventListener("load", finish, { once: true });
              image.addEventListener("error", finish, { once: true });
            }
          }),
      ),
    );
  }
  function collectReportStyles() {
    return Array.from(document.styleSheets)
      .flatMap((sheet) => {
        try {
          return Array.from(sheet.cssRules, (rule) => rule.cssText);
        } catch {
          return [];
        }
      })
      .join("\n");
  }
  async function getEmbeddedGtmCoverArtwork() {
    if (theme !== "gtm") return "";
    const response = await fetch("/assets/gtm-market-cover-art.png");
    if (!response.ok) throw new Error("GTM cover artwork could not be prepared for export.");
    const blob = await response.blob();
    return await new Promise<string>((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(String(reader.result));
      reader.onerror = () =>
        reject(new Error("GTM cover artwork could not be embedded for export."));
      reader.readAsDataURL(blob);
    });
  }
  async function createStandaloneReportDocument(documentTitle = report.metadata.title) {
    const root = document.querySelector<HTMLElement>(".report-pages");
    if (!root) throw new Error("The report canvas is not available.");
    const clone = root.cloneNode(true) as HTMLElement;
    clone
      .querySelectorAll(".active-section")
      .forEach((element) => element.classList.remove("active-section"));
    clone
      .querySelectorAll('[contenteditable="true"]')
      .forEach((element) => element.setAttribute("contenteditable", "false"));
    clone.querySelectorAll(".editor-only").forEach((element) => element.remove());
    const safeTitle = documentTitle.replace(
      /[&<>"']/g,
      (character) =>
        ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[character]!,
    );
    const embeddedCoverArtwork = await getEmbeddedGtmCoverArtwork();
    const exportCss = `
      @page { size: A4 portrait; margin: 0; }
      html, body { margin: 0; padding: 0; background: white; }
      .saved-report { display:block; height:auto; }
      .report-pages { width:210mm !important; margin:0 !important; }
      .page-wrapper { break-after: page; margin:0 !important; }
      .page-wrapper:last-child { break-after: auto; }
      .page-label { display:none !important; }
      .report-page { box-shadow:none !important; width:210mm !important; min-height:297mm; break-after:avoid; }
      .report-page:not(.report-page-cover):not(.report-page-back-cover) { padding:0 14mm 11mm !important; }
      .report-page:not(.report-page-cover):not(.report-page-back-cover) .publication-header { margin:0 -14mm; padding:0 14mm; }
      .report-page:not(.report-page-cover):not(.report-page-back-cover) .page-body { padding:12mm 0 8mm; }
      .report-page:not(.report-page-cover):not(.report-page-back-cover) .publication-footer { margin-top:auto; }
      .report-page-back-cover { height:calc(297mm - 2px) !important; min-height:calc(297mm - 2px) !important; padding:0 16mm 12mm !important; break-after:auto !important; }
      .report-page-back-cover .back-cover-content { min-height:241mm; }
      .editor-app[data-theme="gtm"] .report-page-cover, .editor-app[data-theme="gtm"] .report-page-back-cover { width:210mm !important; height:297mm !important; min-height:297mm !important; margin:0 !important; border:0 !important; outline:0 !important; box-shadow:none !important; }
      .editor-app[data-theme="gtm"] .report-page-cover::after { background:linear-gradient(90deg,#050505 0%,rgb(5 5 5 / .97) 38%,rgb(5 5 5 / .2) 76%,#050505 100%),url("${embeddedCoverArtwork}") right bottom / cover no-repeat !important; }
      .editor-app[data-theme="gtm"] .report-page-back-cover::before { background:linear-gradient(270deg,#050505 0%,rgb(5 5 5 / .88) 42%,rgb(5 5 5 / .12) 100%),url("${embeddedCoverArtwork}") left bottom / cover no-repeat !important; }
      .report-section { outline:none !important; }
      .report-section, .chart-placeholder, .report-scenarios { break-inside:avoid-page; }
      .report-table-wrap { overflow:visible !important; }
      thead { display:table-header-group; }
      tr { break-inside:avoid-page; }
      .editor-only, .active-section::before { display:none !important; }
      * { print-color-adjust: exact; -webkit-print-color-adjust: exact; }
    `;
    return `<!doctype html><html lang="${report.locale}" dir="${report.locale === "ar" ? "rtl" : "ltr"}"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${safeTitle}</title><style>${collectReportStyles()}\n${exportCss}</style></head><body><main class="editor-app saved-report" data-theme="${theme}">${clone.outerHTML}</main></body></html>`;
  }
  async function renderAllPagesForExport() {
    // Smaller reports are already rendered in full. Avoid an unnecessary state
    // transition while a browser print dialog owns focus: it can race the Radix
    // portal teardown when returning to the editor.
    if (!shouldVirtualize) return;
    setRenderAllPages(true);
    await new Promise<void>((resolve) =>
      requestAnimationFrame(() => requestAnimationFrame(() => resolve())),
    );
  }
  async function saveReportHtml() {
    setExportBusy(true);
    setExportError("");
    try {
      await renderAllPagesForExport();
      const root = document.querySelector<HTMLElement>(".report-pages");
      if (!root) throw new Error("The report canvas is not available.");
      await waitForPrintAssets(root);
      const html = await createStandaloneReportDocument();
      const blob = new Blob([html], { type: "text/html;charset=utf-8" });
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.download = `${report.id || "marketpulse-report"}.html`;
      link.click();
      URL.revokeObjectURL(url);
      setExportOpen(false);
    } catch (error) {
      setExportError(error instanceof Error ? error.message : "HTML export failed.");
    } finally {
      if (shouldVirtualize) setRenderAllPages(false);
      setExportBusy(false);
    }
  }
  function saveReportJson() {
    setExportError("");
    try {
      const json = JSON.stringify(serializeCanonicalReport(report), null, 2);
      const roundTrip = parseReportJsonText(json);
      if (!roundTrip.ok)
        throw new Error(roundTrip.issues[0]?.message ?? "Exported JSON failed validation.");
      const blob = new Blob([json], { type: "application/json" });
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.download = `${report.id || "report"}.json`;
      link.click();
      window.setTimeout(() => URL.revokeObjectURL(url), 1000);
      setExportOpen(false);
    } catch (error) {
      setExportError(error instanceof Error ? error.message : "JSON export failed.");
    }
  }
  function downloadSupportedGtmJsonSample() {
    const blob = new Blob([JSON.stringify(gtmCanonicalSampleJson, null, 2)], {
      type: "application/json",
    });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = "gtm-canonical-report.sample.json";
    link.click();
    window.setTimeout(() => URL.revokeObjectURL(url), 1000);
  }
  async function printReport() {
    setExportBusy(true);
    setExportError("");
    const printWindow = window.open("", "_blank");
    try {
      await renderAllPagesForExport();
      const root = document.querySelector<HTMLElement>(".report-pages");
      if (!root) throw new Error("The report canvas is not available.");
      if (!printWindow)
        throw new Error("The browser blocked the print window. Allow pop-ups and try again.");
      await waitForPrintAssets(root);
      setExportOpen(false);
      printWindow.document.open();
      // Chrome and Edge use the print document title as the default Save as PDF filename.
      // Do not add ".pdf" here: the native dialog supplies the extension itself.
      const documentTitle =
        theme === "gtm" ? getGtmPdfBaseName(report.date, report.locale) : report.metadata.title;
      printWindow.document.write(await createStandaloneReportDocument(documentTitle));
      printWindow.document.close();
      if (printWindow.document.readyState !== "complete")
        await new Promise<void>((resolve) =>
          printWindow.addEventListener("load", () => resolve(), { once: true }),
        );
      await waitForPrintAssets(printWindow.document.body);
      printWindow.focus();
      printWindow.print();
    } catch (error) {
      setExportError(error instanceof Error ? error.message : "Print preparation failed.");
    } finally {
      if (shouldVirtualize) setRenderAllPages(false);
      setExportBusy(false);
    }
  }
  function select(id: string) {
    setSelectedId(id);
    setMobilePanel(null);
    const pageIndex = pages.findIndex((sections) => sections.some((section) => section.id === id));
    if (pageIndex < 0) return;
    if (!shouldVirtualize) {
      document
        .getElementById(`block-${id}`)
        ?.scrollIntoView({ behavior: "smooth", block: "center" });
      return;
    }
    pendingScrollId.current = id;
    setVirtualRange({
      start: Math.max(0, pageIndex - VIRTUAL_PAGE_BUFFER),
      end: Math.min(pages.length - 1, pageIndex + VIRTUAL_PAGE_BUFFER),
    });
    canvasRef.current?.scrollTo({
      top: Math.max(0, pageOffsets[pageIndex]! - canvasRef.current.clientHeight / 3),
      behavior: "smooth",
    });
  }
  function move(direction: number) {
    const index = report.sections.findIndex((s) => s.id === selectedId);
    if (index < 0 || index + direction < 0 || index + direction >= report.sections.length) return;
    const sections = [...report.sections];
    const item = sections[index];
    if (!item) return;
    sections.splice(index, 1);
    sections.splice(index + direction, 0, item);
    update({ ...report, sections });
  }
  function undo() {
    const previous = historyRef.current.at(-1);
    if (!previous) return;
    const nextHistory = historyRef.current.slice(0, -1);
    const nextFuture = [...futureRef.current, reportRef.current];
    historyRef.current = nextHistory;
    futureRef.current = nextFuture;
    reportRef.current = previous;
    setFuture(nextFuture);
    setHistory(nextHistory);
    setReport(previous);
    setTextStats(calculateReportTextStats(previous));
    setEnglishSourceReport(previous.locale === "en" ? previous : englishSourceReport);
  }
  function redo() {
    const next = futureRef.current.at(-1);
    if (!next) return;
    const nextHistory = [...historyRef.current, reportRef.current];
    const nextFuture = futureRef.current.slice(0, -1);
    historyRef.current = nextHistory;
    futureRef.current = nextFuture;
    reportRef.current = next;
    setHistory(nextHistory);
    setFuture(nextFuture);
    setReport(next);
    setTextStats(calculateReportTextStats(next));
    setEnglishSourceReport(next.locale === "en" ? next : englishSourceReport);
  }
  function addSection() {
    const id = crypto.randomUUID();
    const section: ReportSection = {
      id,
      type: newType,
      title:
        newType === "paragraph"
          ? "New commentary"
          : newType === "heading"
            ? "New heading"
            : newType === "scenario"
              ? "New scenarios"
              : "New chart",
      data:
        newType === "scenario"
          ? { bullish: "Enter the bullish scenario.", bearish: "Enter the bearish scenario." }
          : newType === "chart"
            ? { caption: "Chart image pending" }
            : { text: "Enter your report commentary." },
    };
    update({ ...report, sections: [...report.sections, section] });
    setSelectedId(id);
    setAddOpen(false);
  }
  const selectedIndex = report.sections.findIndex((s) => s.id === selectedId);
  return (
    <div
      lang={interfaceLocale}
      dir={isRtlLocale(interfaceLocale) ? "rtl" : "ltr"}
      data-theme={theme}
      className={`editor-app ${preview ? "is-preview" : ""} ${leftOpen ? "" : "left-hidden"} ${rightOpen ? "" : "right-hidden"} mobile-panel-${mobilePanel ?? "closed"}`}
    >
      <header className="app-header">
        <div className="app-brand">
          {publicationBrand}
          <span className="brand-dot" />
        </div>
        <div className="header-separator" />
        <div className="header-document">
          <div className="document-title">
            {report.metadata.title}
            {isSample && <span className="sample-tag">SAMPLE</span>}
          </div>
          <div className="document-meta">
            <span>{report.date}</span>
            <span className="meta-dot">·</span>
            <Globe2 size={12} /> {localeNames[report.locale]} <span className="meta-dot">·</span>
            <Circle size={7} className="status-dot" />
            <span>
              {history.length || future.length
                ? "Modified · not saved"
                : "Local session · not saved"}
            </span>
          </div>
        </div>
        <div className="header-actions">
          <input
            id="report-import-input"
            type="file"
            accept="application/json,.json,application/pdf,.pdf"
            hidden
            onChange={handleReportImport}
          />
          <Button
            variant="ghost"
            onClick={() => document.getElementById("report-import-input")?.click()}
          >
            <Upload />
            {ui.import}
          </Button>
          {theme === "gtm" && (
            <Button variant="ghost" onClick={() => setSupportedJsonOpen(true)}>
              <FileText />
              Supported JSON Format
            </Button>
          )}
          <Button variant={preview ? "secondary" : "outline"} onClick={() => setPreview(!preview)}>
            <Eye />
            {preview ? ui.backToEditor : ui.preview}
          </Button>
          <Button
            variant="outline"
            disabled={exportBusy}
            onClick={() => {
              setExportError("");
              setExportOpen(true);
            }}
          >
            <Download />
            {ui.export}
            <ChevronDown />
          </Button>
        </div>
      </header>
      <div className="workspace-bar">
        <div className="workspace-label">
          <FileText size={14} />
          <span>{preview ? ui.documentPreview : ui.reportEditor}</span>
          <span className="workspace-breadcrumb">/</span>
          <span className="edition-name">{report.date} edition</span>
        </div>
        <div className="workspace-tools">
          <label className="theme-control">
            <span>Theme</span>
            <select
              aria-label="Report theme"
              value={theme}
              onChange={(event) => setTheme(event.target.value as "gtm" | "classic")}
            >
              <option value="gtm">GTM theme</option>
              <option value="classic">Classic white</option>
            </select>
          </label>
          {!preview && (
            <>
              <Button
                variant="ghost"
                size="icon"
                title="Toggle section sidebar"
                aria-label="Toggle section sidebar"
                onClick={() => setLeftOpen(!leftOpen)}
              >
                <PanelLeftClose />
              </Button>
              <Button
                variant="ghost"
                size="icon"
                title="Toggle properties sidebar"
                aria-label="Toggle properties sidebar"
                onClick={() => setRightOpen(!rightOpen)}
              >
                <PanelRightClose />
              </Button>
              <span className="tool-separator" />
              <Button
                variant="ghost"
                size="icon"
                title="Undo"
                aria-label="Undo"
                disabled={!history.length}
                onClick={undo}
              >
                <Undo2 />
              </Button>
              <Button
                variant="ghost"
                size="icon"
                title="Redo"
                aria-label="Redo"
                disabled={!future.length}
                onClick={redo}
              >
                <Redo2 />
              </Button>
            </>
          )}
          <span className="tool-separator" />
          <Button
            variant="ghost"
            size="icon"
            aria-label="Zoom out"
            title="Zoom out"
            disabled={zoom <= 65}
            onClick={() => setZoom((z) => z - 10)}
          >
            <Minus />
          </Button>
          <span className="zoom-value">{zoom}%</span>
          <Button
            variant="ghost"
            size="icon"
            aria-label="Zoom in"
            title="Zoom in"
            disabled={zoom >= 105}
            onClick={() => setZoom((z) => z + 10)}
          >
            <Plus />
          </Button>
        </div>
      </div>
      {!preview && (
        <div className="mobile-editor-actions" aria-label="Mobile editor controls">
          <Button
            variant={mobilePanel === "sections" ? "secondary" : "outline"}
            onClick={() => {
              setLeftOpen(true);
              setMobilePanel((current) => (current === "sections" ? null : "sections"));
            }}
            aria-pressed={mobilePanel === "sections"}
          >
            <PanelLeftClose />
            Sections
          </Button>
          <Button
            variant={mobilePanel === "properties" ? "secondary" : "outline"}
            onClick={() => {
              setRightOpen(true);
              setMobilePanel((current) => (current === "properties" ? null : "properties"));
            }}
            aria-pressed={mobilePanel === "properties"}
          >
            <Settings2 />
            Properties
          </Button>
        </div>
      )}
      {mobilePanel && (
        <button
          type="button"
          className="mobile-panel-scrim"
          aria-label="Close mobile editor panel"
          onClick={() => setMobilePanel(null)}
        />
      )}
      <div className="editor-layout">
        {!preview && leftOpen && (
          <aside className="structure-sidebar">
            <div className="sidebar-heading">
              <h2>{ui.reportStructure}</h2>
              <span>{report.sections.length}</span>
            </div>
            <div className="sidebar-subheading">{ui.sections}</div>
            <nav aria-label="Report sections">
              {report.sections.map((section) => (
                <Button
                  key={section.id}
                  variant="ghost"
                  className={`section-nav ${selectedId === section.id ? "selected" : ""}`}
                  onClick={() => select(section.id)}
                >
                  <GripVertical className="section-grip" />
                  <span className="section-name">{section.title}</span>
                  {issues.some((i) => i.sectionId === section.id) ? (
                    <AlertCircle className="text-warning" />
                  ) : (
                    <Check className="section-check" />
                  )}
                </Button>
              ))}
            </nav>
            <Button variant="outline" className="add-section" onClick={() => setAddOpen(true)}>
              <Plus />
              {ui.addSection}
            </Button>
            <div className="sidebar-bottom">
              <div className="document-icon">
                <FileText size={18} />
              </div>
              <div>
                <strong>Demonstration edition</strong>
                <p>Illustrative data · not for trading</p>
              </div>
            </div>
          </aside>
        )}
        <main
          className={`canvas-workspace zoom-${zoom}`}
          ref={canvasRef}
          onScroll={handleCanvasScroll}
        >
          <div className="canvas-caption">
            <span>
              <span className="canvas-dot" />
              {preview ? "Preview" : "Editing"} <span className="caption-divider">/</span> A4
              portrait
            </span>
            <span>
              {publicationPageCount} {ui.pageCount.toLowerCase()}{" "}
              <span className="caption-divider">·</span> {localeNames[report.locale]}
            </span>
          </div>
          <div className="report-pages">
            {renderedRange.start > 0 && (
              <div
                className="page-spacer"
                aria-hidden="true"
                style={{ height: pageOffsets[renderedRange.start] }}
              />
            )}
            {pages
              .slice(renderedRange.start, renderedRange.end + 1)
              .map((sections, visibleIndex) => {
                const pageIndex = renderedRange.start + visibleIndex;
                return (
                  <div className="page-wrapper" key={sections[0]?.id}>
                    <ReportPage
                      report={report}
                      pageNumber={pageIndex + 1}
                      pageCount={publicationPageCount}
                      editable={!preview}
                      showGtmBranding={theme === "gtm"}
                      onBrandChange={(brandName) => update(rebrandReport(report, brandName))}
                    >
                      {sections.map((section) => (
                        <section
                          id={`block-${section.id}`}
                          key={section.id}
                          className={`report-section section-${section.type} ${!preview && selectedId === section.id ? "active-section" : ""} ${section.type === "cover" ? "cover-section" : ""} ${section.type === "chart" ? "chart-section" : ""}`}
                          style={
                            {
                              "--section-font-scale": String(section.data.fontScale ?? 1),
                            } as CSSProperties
                          }
                          onClick={() => {
                            if (!preview) setSelectedId(section.id);
                          }}
                        >
                          {section.type !== "cover" && (
                            <ReportHeading>
                              <EditableText
                                text={section.title}
                                label={`Section title ${section.id}`}
                                editable={!preview}
                                onChange={(title) => updateSection({ ...section, title })}
                              />
                            </ReportHeading>
                          )}
                          <ReportBlock
                            section={section}
                            editable={!preview}
                            onChange={updateSection}
                          />
                        </section>
                      ))}
                    </ReportPage>
                    <div className="page-label">
                      PAGE {pageIndex + 1} OF {publicationPageCount}
                    </div>
                  </div>
                );
              })}
            {renderedRange.end < pages.length - 1 && (
              <div
                className="page-spacer"
                aria-hidden="true"
                style={{ height: pageOffsets[pages.length]! - pageOffsets[renderedRange.end + 1]! }}
              />
            )}
            {theme === "gtm" && renderedRange.end === pages.length - 1 && (
              <div className="page-wrapper report-back-cover-wrapper">
                <ReportBackCover
                  report={report}
                  pageNumber={publicationPageCount}
                  pageCount={publicationPageCount}
                  editable={!preview}
                  onMetadataChange={(key, value) =>
                    update({
                      ...report,
                      metadata: { ...report.metadata, [key]: value },
                    })
                  }
                />
                <div className="page-label">
                  PAGE {publicationPageCount} OF {publicationPageCount}
                </div>
              </div>
            )}
          </div>
          <div className="canvas-end">END OF REPORT</div>
        </main>
        {!preview && rightOpen && (
          <aside className="properties-sidebar">
            <div className="sidebar-heading">
              <h2>{ui.documentProperties}</h2>
              <Settings2 size={16} />
            </div>
            <div className="property-group">
              <div className="property-group-title">{ui.reportDetails}</div>
              <label className="property-field">
                {ui.brandName}
                <input
                  value={publicationBrand}
                  onChange={(event) => update(rebrandReport(report, event.target.value))}
                />
              </label>
              <label className="property-field">
                {ui.reportTitle}
                <input
                  value={report.metadata.title}
                  onChange={(e) =>
                    update({ ...report, metadata: { ...report.metadata, title: e.target.value } })
                  }
                />
              </label>
              <label className="property-field">
                {ui.reportDate}
                <input
                  type="date"
                  value={report.date}
                  onChange={(e) => update({ ...report, date: e.target.value })}
                />
              </label>
              <div className="property-field">
                {ui.sourceLanguage}
                <div className="property-static">
                  <Globe2 size={14} />
                  {localeNames[report.sourceLocale]}{" "}
                  <span>{report.sourceLocale.toUpperCase()}</span>
                </div>
              </div>
              <label className="property-field">
                {ui.targetLanguage}
                <select
                  aria-label={ui.targetLanguage}
                  value={targetLocale}
                  onChange={(event) =>
                    setTargetLocale(event.target.value as Exclude<CanonicalReport["locale"], "en">)
                  }
                >
                  <option value="es">{localeNames.es}</option>
                  <option value="ar">{localeNames.ar}</option>
                </select>
                <Button
                  variant="outline"
                  onClick={translateReport}
                  disabled={translationBusy || !englishSourceReport}
                >
                  <Globe2 />
                  {translationBusy ? ui.translating : ui.translate}
                </Button>
                <small role="status" aria-live="polite">
                  {translationBusy
                    ? ui.translating
                    : translationComplete
                      ? ui.translationComplete
                      : (translationIssues[0]?.message ?? "")}
                </small>
              </label>
              <label className="property-field">
                {ui.interfaceLanguage}
                <select
                  aria-label={ui.interfaceLanguage}
                  value={interfaceLocale}
                  onChange={(event) =>
                    setInterfaceLocale(event.target.value as CanonicalReport["locale"])
                  }
                >
                  <option value="en">{localeNames.en}</option>
                  <option value="es">{localeNames.es}</option>
                  <option value="ar">{localeNames.ar}</option>
                </select>
              </label>
            </div>
            <div className="property-group">
              <div className="property-group-title">{ui.pageSettings}</div>
              <div className="property-pair">
                <span>{ui.format}</span>
                <strong>A4 · Portrait</strong>
              </div>
              <div className="property-pair">
                <span>{ui.margins}</span>
                <strong>18 mm</strong>
              </div>
              <div className="property-pair">
                <span>{ui.pageCount}</span>
                <strong>
                  {publicationPageCount} {ui.pageCount.toLowerCase()}
                </strong>
              </div>
            </div>
            {selected && (
              <div className="property-group">
                <div className="property-group-title">{ui.selectedSection}</div>
                <label className="property-field">
                  {ui.sectionTitle}
                  <input
                    value={selected.title}
                    onChange={(e) => updateSection({ ...selected, title: e.target.value })}
                  />
                </label>
                <div className="property-pair">
                  <span>Type</span>
                  <strong>{selected.type}</strong>
                </div>
                <div className="font-size-controls" aria-label="Selected section font size">
                  <span>Text size</span>
                  <Button
                    variant="outline"
                    size="sm"
                    aria-label="Decrease font size for selected section"
                    disabled={(selected.data.fontScale ?? 1) <= 0.85}
                    onClick={() =>
                      updateSection({
                        ...selected,
                        data: {
                          ...selected.data,
                          fontScale: Math.max(
                            0.85,
                            Number(((selected.data.fontScale ?? 1) - 0.1).toFixed(2)),
                          ),
                        },
                      })
                    }
                  >
                    A−
                  </Button>
                  <strong>{Math.round((selected.data.fontScale ?? 1) * 100)}%</strong>
                  <Button
                    variant="outline"
                    size="sm"
                    aria-label="Increase font size for selected section"
                    disabled={(selected.data.fontScale ?? 1) >= 1.45}
                    onClick={() =>
                      updateSection({
                        ...selected,
                        data: {
                          ...selected.data,
                          fontScale: Math.min(
                            1.45,
                            Number(((selected.data.fontScale ?? 1) + 0.1).toFixed(2)),
                          ),
                        },
                      })
                    }
                  >
                    A+
                  </Button>
                </div>
                <div className="section-actions">
                  <Button
                    variant="outline"
                    size="icon"
                    title="Move section up"
                    aria-label="Move section up"
                    disabled={selectedIndex <= 0}
                    onClick={() => move(-1)}
                  >
                    <ArrowUp />
                  </Button>
                  <Button
                    variant="outline"
                    size="icon"
                    title="Move section down"
                    aria-label="Move section down"
                    disabled={selectedIndex === report.sections.length - 1}
                    onClick={() => move(1)}
                  >
                    <ArrowDown />
                  </Button>
                  <Button
                    variant="outline"
                    size="icon"
                    title="Duplicate section"
                    aria-label="Duplicate section"
                    onClick={() => {
                      const copy = {
                        ...structuredClone(selected),
                        id: crypto.randomUUID(),
                        title: `${selected.title} (copy)`,
                      };
                      const sections = [...report.sections];
                      sections.splice(selectedIndex + 1, 0, copy);
                      update({ ...report, sections });
                      setSelectedId(copy.id);
                    }}
                  >
                    <Copy />
                  </Button>
                  <Button
                    variant="outline"
                    size="icon"
                    title="Delete section"
                    aria-label="Delete section"
                    disabled={selected.type === "cover"}
                    onClick={() => {
                      update({
                        ...report,
                        sections: report.sections.filter((s) => s.id !== selected.id),
                      });
                      setSelectedId(report.sections.find((s) => s.id !== selected.id)?.id ?? "");
                    }}
                  >
                    <Trash2 />
                  </Button>
                </div>
              </div>
            )}
            <div className="property-group validation-group">
              <div className="property-group-title">
                <ShieldCheck size={14} />
                {ui.foundationChecks}
              </div>
              <div className={`validation-status ${errors.length ? "has-errors" : ""}`}>
                <CheckCircle2 size={17} />
                <strong>
                  {errors.length
                    ? `${errors.length} error${errors.length > 1 ? "s" : ""} found`
                    : ui.basicStructureChecked}
                </strong>
              </div>
              <div className="validation-item">
                <Check size={14} />
                <span>{report.sections.length} sections present</span>
              </div>
              <div className="validation-item">
                <Check size={14} />
                <span>
                  {ui.sourceLanguage}: {localeNames[report.sourceLocale]}
                </span>
              </div>
              {issues.map((issue, index) => (
                <div className={`validation-item ${issue.severity}`} key={index}>
                  <AlertCircle size={14} />
                  <span>{issue.message}</span>
                </div>
              ))}
              <p className="validation-note">{ui.runtimeValidation}</p>
              {translationIssues.map((issue, index) => (
                <div className={`validation-item ${issue.severity}`} key={`translation-${index}`}>
                  <AlertCircle size={14} />
                  <span>{issue.message}</span>
                </div>
              ))}
            </div>
            <div className="local-notice">
              <ShieldCheck size={15} />
              <div>
                <strong>{ui.localWorkspace}</strong>
                <p>
                  Changes exist only in this tab. JSON imports replace the report only after
                  confirmation.
                </p>
              </div>
            </div>
          </aside>
        )}
      </div>
      <footer className="app-statusbar">
        <span>
          <span className="canvas-dot" />
          {preview ? ui.preview : ui.reportEditor}
          <span className="statusbar-divider">|</span>Schema v1.0
        </span>
        <span className="statusbar-counts" aria-label="Report content counts">
          Characters: {textStats.characters.toLocaleString()}
          <span className="statusbar-divider">|</span>
          Words: {textStats.words.toLocaleString()}
        </span>
        <span>
          {ui.localSession}
          <span className="statusbar-divider">|</span>
          {publicationBrand} Report Builder
        </span>
      </footer>
      <Dialog open={addOpen} onOpenChange={setAddOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{ui.addSection}</DialogTitle>
            <DialogDescription>Choose a supported section for this edition.</DialogDescription>
          </DialogHeader>
          <label className="property-field">
            Section type
            <select value={newType} onChange={(e) => setNewType(e.target.value as SectionType)}>
              <option value="paragraph">Paragraph</option>
              <option value="heading">Heading</option>
              <option value="scenario">Bullish & bearish scenarios</option>
              <option value="chart">Chart placeholder</option>
            </select>
          </label>
          <Button onClick={addSection}>
            <Plus />
            {ui.addSection}
          </Button>
        </DialogContent>
      </Dialog>
      <Dialog
        open={
          Boolean(pendingImport) ||
          (!pendingImport && importIssues.some((issue) => issue.severity === "error"))
        }
        onOpenChange={(open) => {
          if (!open) {
            setPendingImport(null);
            setImportIssues([]);
          }
        }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>
              {pendingImport ? ui.replaceReport + "?" : ui.import + " file rejected"}
            </DialogTitle>
            <DialogDescription>
              {pendingImport
                ? "The parsed report is ready. Confirm replacement to update the editor model."
                : "The current report is unchanged because this file did not pass validation."}
            </DialogDescription>
          </DialogHeader>
          {importFileName && <p className="import-file-name">{importFileName}</p>}
          <div className="import-issues">
            {importIssues.map((issue, index) => (
              <div
                className={`validation-item ${issue.severity}`}
                key={`${issue.message}-${index}`}
              >
                <AlertCircle size={14} />
                <span>{issue.message}</span>
              </div>
            ))}
            {pendingImport && (
              <div className="validation-item info">
                <Check size={14} />
                <span>{pendingImport.sections.length} sections ready to import.</span>
              </div>
            )}
          </div>
          {pendingImport && (
            <div className="dialog-actions">
              <Button variant="outline" onClick={() => setPendingImport(null)}>
                {ui.cancel}
              </Button>
              <Button onClick={confirmImport}>{ui.replaceReport}</Button>
            </div>
          )}
        </DialogContent>
      </Dialog>
      <Dialog open={exportOpen} onOpenChange={setExportOpen}>
        <DialogContent onClose={() => setExportOpen(false)}>
          <DialogHeader>
            <DialogTitle>{ui.exportReport}</DialogTitle>
            <DialogDescription>
              Fonts, images, and the current paginated report canvas are checked before export.
            </DialogDescription>
          </DialogHeader>
          {exportError && (
            <div className="export-error" role="alert">
              <AlertCircle size={15} />
              <span>{exportError}</span>
            </div>
          )}
          <div className="export-options">
            {theme === "gtm" && (
              <Button variant="outline" onClick={saveReportJson} disabled={exportBusy}>
                <Download />
                Download JSON
              </Button>
            )}
            <Button onClick={saveReportHtml} disabled={exportBusy}>
              <Download />
              {theme === "gtm" ? "Download HTML" : ui.saveHtml}
            </Button>
            <Button variant="outline" onClick={printReport} disabled={exportBusy}>
              <FileText />
              {theme === "gtm" ? "Download PDF" : ui.printPdf}
            </Button>
          </div>
          <p className="validation-note">
            Print output hides editor controls and uses the browser print dialog for PDF generation.
          </p>
          <div className="dialog-actions">
            <Button type="button" variant="outline" onClick={() => setExportOpen(false)}>
              Close
            </Button>
          </div>
        </DialogContent>
      </Dialog>
      <Dialog open={supportedJsonOpen} onOpenChange={setSupportedJsonOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Supported JSON Format</DialogTitle>
            <DialogDescription>
              Use this canonical GTM example to prepare an import. Required report fields are
              retained, and each section needs a stable id, type, title, and data object.
            </DialogDescription>
          </DialogHeader>
          <div className="export-options">
            <Button onClick={downloadSupportedGtmJsonSample}>
              <Download />
              Download sample JSON
            </Button>
          </div>
          <p className="validation-note">
            The sample includes cover, market dashboard, calendar, technical analysis, live chart,
            scenarios, sources, and risk disclosure examples.
          </p>
        </DialogContent>
      </Dialog>
    </div>
  );
}
