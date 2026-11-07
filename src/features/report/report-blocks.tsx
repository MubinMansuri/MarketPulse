/* eslint-disable @next/next/no-img-element -- report images can be user-imported data URLs and must remain embeddable in standalone HTML exports. */

import { useState, type ReactNode } from "react";
import { ImageIcon, TrendingUp, TrendingDown, Upload } from "lucide-react";
import type { CanonicalReport, ReportSection, TableData } from "./model";
import { formatReportDate } from "./locale";
import { getSectionDefinition } from "./report-registry";
import { mapCanonicalSectionToEditable, updateEditableSectionText } from "./report-mapping";
import { brand } from "./brand";
export function EditableText({
  text,
  label,
  editable,
  onChange,
  className = "",
}: {
  text: string;
  label: string;
  editable: boolean;
  onChange: (value: string) => void;
  className?: string;
}) {
  return (
    <span
      className={`editable-text ${className}`}
      contentEditable={editable}
      suppressContentEditableWarning
      role={editable ? "textbox" : undefined}
      aria-label={editable ? label : undefined}
      onBlur={(e) => {
        if (e.currentTarget.textContent !== text) onChange(e.currentTarget.textContent ?? "");
      }}
    >
      {text}
    </span>
  );
}
export function ReportHeading({ children }: { children: ReactNode }) {
  return <h2 className="report-heading">{children}</h2>;
}
export function ReportParagraph({ children }: { children: ReactNode }) {
  return <p className="report-paragraph">{children}</p>;
}
export function ReportTable({
  table,
  editable,
  onChange,
}: {
  table: TableData;
  editable: boolean;
  onChange: (table: TableData) => void;
}) {
  const tableKind = table.columns.some((column) => column.key === "event")
    ? "calendar-table"
    : table.columns.some((column) => column.key === "instrument")
      ? "market-table"
      : "";
  return (
    <div className="report-table-wrap">
      <table className={`report-table ${tableKind}`}>
        <thead>
          <tr>
            {table.columns.map((column) => (
              <th key={column.key}>
                <EditableText
                  text={column.label}
                  label={`${column.label} column heading`}
                  editable={editable}
                  onChange={(label) =>
                    onChange({
                      ...table,
                      columns: table.columns.map((item) =>
                        item.key === column.key ? { ...item, label } : item,
                      ),
                    })
                  }
                />
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {table.rows.map((row, index) => (
            <tr key={index}>
              {table.columns.map((column) => {
                const value = row[column.key];
                const display =
                  typeof value === "number"
                    ? value.toLocaleString("en-US", {
                        minimumFractionDigits: column.key === "price" ? (value < 2 ? 4 : 2) : 0,
                        maximumFractionDigits: 4,
                      })
                    : String(value ?? "");
                return (
                  <td
                    key={column.key}
                    className={[
                      column.key === "bias"
                        ? `bias-cell ${String(value).toLowerCase()}`
                        : column.key === "change"
                          ? String(value).startsWith("+")
                            ? "positive"
                            : "negative"
                          : "",
                      ["instrument", "price", "change"].includes(column.key)
                        ? "financial-token"
                        : "",
                    ]
                      .filter(Boolean)
                      .join(" ")}
                  >
                    <EditableText
                      text={display}
                      label={`${column.label} row ${index + 1}`}
                      editable={editable}
                      onChange={(text) => {
                        const parsed = Number(text.replaceAll(",", ""));
                        onChange({
                          ...table,
                          rows: table.rows.map((r, i) =>
                            i === index
                              ? {
                                  ...r,
                                  [column.key]:
                                    typeof value === "number" &&
                                    text.trim() &&
                                    Number.isFinite(parsed)
                                      ? parsed
                                      : text,
                                }
                              : r,
                          ),
                        });
                      }}
                    />
                  </td>
                );
              })}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
export function ReportScenario({ section, editable, onChange }: BlockProps) {
  const scenarioText = (side: "bullish" | "bearish") => {
    const label = side === "bullish" ? "bullish" : "bearish";
    return (section.data[side] ?? "")
      .replace(
        new RegExp(
          `^\\s*${label}(?:\\s*[/\\u2013-]\\s*risk)?\\s+scenario\\s*[:\\u2013-]?\\s*`,
          "i",
        ),
        "",
      )
      .trim();
  };
  return (
    <div className="report-scenarios">
      {(["bullish", "bearish"] as const).map((side) => (
        <div className={`scenario ${side}`} key={side}>
          <h3>
            {side === "bullish" ? <TrendingUp size={15} /> : <TrendingDown size={15} />}
            {side === "bullish" ? "Bullish scenario" : "Bearish scenario"}
          </h3>
          <ReportParagraph>
            <EditableText
              text={scenarioText(side)}
              label={`${side} scenario`}
              editable={editable}
              onChange={(value) =>
                onChange({ ...section, data: { ...section.data, [side]: value } })
              }
            />
          </ReportParagraph>
        </div>
      ))}
    </div>
  );
}

function MarketReferenceStrip({ section, editable, onChange }: BlockProps) {
  const facts = [
    ["Instrument", section.data.instrument],
    ["Daily bias", section.data.bias],
    ["Reference", section.data.reference],
  ].filter(([, value]) => Boolean(value)) as [string, string][];

  if (!facts.length) return null;

  return (
    <dl className="market-reference-strip" aria-label={`${section.title} market references`}>
      {facts.map(([label, value]) => {
        const field =
          label === "Instrument" ? "instrument" : label === "Daily bias" ? "bias" : "reference";
        return (
          <div key={field}>
            <dt>{label}</dt>
            <dd>
              <EditableText
                text={value}
                label={`${section.title} ${label}`}
                editable={editable}
                onChange={(nextValue) =>
                  onChange({ ...section, data: { ...section.data, [field]: nextValue } })
                }
              />
            </dd>
          </div>
        );
      })}
    </dl>
  );
}
export function ChartPlaceholder({ section, editable, onChange }: BlockProps) {
  const [imageError, setImageError] = useState(false);
  const [uploadError, setUploadError] = useState("");
  return (
    <figure className="chart-placeholder">
      <div className="chart-grid" aria-hidden="true" />
      {section.data.imageUrl && !imageError ? (
        <img
          src={section.data.imageUrl}
          alt={section.data.caption || section.title}
          onError={() => setImageError(true)}
        />
      ) : (
        <>
          <ImageIcon size={28} />
          <strong>{imageError ? "Chart image failed to load" : "Chart image pending"}</strong>
        </>
      )}
      {section.data.caption && (
        <figcaption>
          <EditableText
            text={section.data.caption}
            label={`${section.title} caption`}
            editable={editable}
            onChange={(caption) => onChange({ ...section, data: { ...section.data, caption } })}
          />
        </figcaption>
      )}
      {editable && (
        <div className="chart-actions editor-only">
          {section.data.chartUrl && (
            <a
              className="chart-live-link"
              href={section.data.chartUrl}
              target="_blank"
              rel="noreferrer"
            >
              Open live chart
            </a>
          )}
          <label className="chart-image-edit">
            <Upload size={15} />
            <span>Replace visual</span>
            <input
              type="file"
              accept="image/png,image/jpeg,image/webp"
              onChange={(event) => {
                const file = event.target.files?.[0];
                if (!file) return;
                if (
                  !["image/png", "image/jpeg", "image/webp"].includes(file.type) ||
                  file.size > 10 * 1024 * 1024
                ) {
                  setUploadError("Choose a PNG, JPEG, or WebP image under 10 MB.");
                  return;
                }
                const reader = new FileReader();
                reader.onload = () => {
                  setImageError(false);
                  setUploadError("");
                  onChange({
                    ...section,
                    data: { ...section.data, imageUrl: String(reader.result) },
                  });
                };
                reader.onerror = () => setUploadError("Image could not be read.");
                reader.readAsDataURL(file);
              }}
            />
          </label>
        </div>
      )}
      {uploadError && (
        <span className="chart-upload-error editor-only" role="alert">
          {uploadError}
        </span>
      )}
    </figure>
  );
}
interface BlockProps {
  section: ReportSection;
  editable: boolean;
  onChange: (section: ReportSection) => void;
}
export function ReportBlock({ section, editable, onChange }: BlockProps) {
  const mapped = mapCanonicalSectionToEditable(section);
  const text = (field: "text" | "caption" | "kicker") => (
    <EditableText
      text={
        field === "text"
          ? mapped.text
          : field === "caption"
            ? mapped.caption
            : (section.data.kicker ?? brand.publication.toUpperCase())
      }
      label={`${section.title} ${field}`}
      editable={editable}
      onChange={(value) =>
        onChange(
          field === "text"
            ? updateEditableSectionText(section, value)
            : { ...section, data: { ...section.data, [field]: value } },
        )
      }
    />
  );
  const block = getSectionDefinition(section.type).block;
  if (block === "cover")
    return (
      <div className="report-cover">
        <div className="publication-eyebrow">{text("kicker")}</div>
        <h1>{text("text")}</h1>
        <ReportParagraph>{text("caption")}</ReportParagraph>
      </div>
    );
  if (block === "table" && section.data.table)
    return (
      <>
        {section.data.text && <ReportParagraph>{text("text")}</ReportParagraph>}
        <ReportTable
          table={section.data.table}
          editable={editable}
          onChange={(table) => onChange({ ...section, data: { ...section.data, table } })}
        />
        {section.data.caption && <ReportParagraph>{text("caption")}</ReportParagraph>}
      </>
    );
  if (block === "scenario")
    return <ReportScenario section={section} editable={editable} onChange={onChange} />;
  if (section.type === "technical-analysis")
    return (
      <>
        <MarketReferenceStrip section={section} editable={editable} onChange={onChange} />
        <ReportParagraph>{text("text")}</ReportParagraph>
      </>
    );
  if (block === "chart")
    return <ChartPlaceholder section={section} editable={editable} onChange={onChange} />;
  if (block === "spacer") return <div className="report-spacer" aria-label="Editorial spacing" />;
  if (block === "divider") return <hr className="report-divider" />;
  if (block === "unknown")
    return <pre className="unknown-content">{JSON.stringify(section.data.original, null, 2)}</pre>;
  return <ReportParagraph>{text("text")}</ReportParagraph>;
}
export function ReportPage({
  report,
  pageNumber,
  pageCount,
  children,
  editable = false,
  showGtmBranding = false,
  onBrandChange = () => {},
}: {
  report: CanonicalReport;
  pageNumber: number;
  pageCount: number;
  children: ReactNode;
  editable?: boolean;
  showGtmBranding?: boolean;
  onBrandChange?: (brandName: string) => void;
}) {
  const publicationBrand = report.metadata.brandName ?? brand.name;
  const isCover = pageNumber === 1 && report.sections[0]?.type === "cover";
  return (
    <article
      className={`report-page ${isCover ? "report-page-cover" : ""}`}
      aria-label={`Report page ${pageNumber}`}
      lang={report.locale}
      dir={report.locale === "ar" ? "rtl" : "ltr"}
    >
      <header className="publication-header">
        <div className="publication-brand">
          {isCover && showGtmBranding && (
            <img
              className="publication-brand-mark"
              src="https://globaltrendmarkets.com/wp-content/themes/blankslate-child/assets/media/img/logo.svg"
              alt={`${publicationBrand} logo`}
              loading="eager"
              decoding="async"
            />
          )}
          <EditableText
            text={publicationBrand}
            label="Publication brand"
            editable={editable}
            onChange={onBrandChange}
          />
        </div>
        <div className="publication-date">
          {brand.publication.toUpperCase()}
          <br />
          <strong>{formatReportDate(report.date || "2026-10-09", report.locale)}</strong>
        </div>
      </header>
      <div className="page-body">
        {children}
        {pageNumber === 1 && report.sections[0]?.type === "cover" && (
          <p className="cover-date">{formatReportDate(report.date, report.locale)}</p>
        )}
      </div>
      <footer className="publication-footer">
        <span>{brand.publication}</span>
        <span aria-label={`Page ${pageNumber} of ${pageCount}`}>
          {String(pageNumber).padStart(2, "0")} <span className="footer-divider">/</span>{" "}
          {String(pageCount).padStart(2, "0")}
        </span>
      </footer>
    </article>
  );
}

export function ReportBackCover({
  report,
  pageNumber,
  pageCount,
  editable = false,
  onMetadataChange = () => {},
}: {
  report: CanonicalReport;
  pageNumber: number;
  pageCount: number;
  editable?: boolean;
  onMetadataChange?: (
    key: "backCoverKicker" | "backCoverHeadline" | "backCoverMessage",
    value: string,
  ) => void;
}) {
  const publicationBrand = report.metadata.brandName ?? brand.name;
  const getBackCoverText = (
    key: "backCoverKicker" | "backCoverHeadline" | "backCoverMessage",
    fallback: string,
  ) => (typeof report.metadata[key] === "string" ? report.metadata[key] : fallback);
  const kicker = getBackCoverText("backCoverKicker", brand.publication);
  const headline = getBackCoverText("backCoverHeadline", "Market Intelligence"); //publicationBrand
  const message = getBackCoverText(
    "backCoverMessage",
    "Clear data. Clear context. Disciplined decisions.",
  );
  return (
    <article
      className="report-page report-page-back-cover"
      aria-label="Report back cover"
      lang={report.locale}
    >
      <div className="back-cover-rule" />
      <div className="back-cover-content">
        <img
          className="back-cover-mark"
          src="https://globaltrendmarkets.com/wp-content/themes/blankslate-child/assets/media/img/logo.svg"
          alt={`${publicationBrand} logo`}
          decoding="async"
        />
        <p className="back-cover-kicker">
          <EditableText
            text={kicker}
            label="Back cover kicker"
            editable={editable}
            onChange={(value) => onMetadataChange("backCoverKicker", value)}
          />
        </p>
        <h2>
          <EditableText
            text={headline}
            label="Back cover headline"
            editable={editable}
            onChange={(value) => onMetadataChange("backCoverHeadline", value)}
          />
        </h2>
        <p>
          <EditableText
            text={message}
            label="Back cover description"
            editable={editable}
            onChange={(value) => onMetadataChange("backCoverMessage", value)}
          />
        </p>
      </div>
      <footer className="publication-footer">
        <span>{formatReportDate(report.date || "2026-10-09", report.locale)}</span>
        <span aria-label={`Page ${pageNumber} of ${pageCount}`}>
          {String(pageNumber).padStart(2, "0")} <span className="footer-divider">/</span>{" "}
          {String(pageCount).padStart(2, "0")}
        </span>
      </footer>
    </article>
  );
}
