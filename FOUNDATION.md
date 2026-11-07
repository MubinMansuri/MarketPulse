# MarketPulse Studio

## Run and entry point

Install dependencies with `npm install`, then run `npm run dev`. The app uses the Next.js App Router. The first page is `/`, defined in **src/app/page.tsx**, which mounts ReportEditor as a deliberate client boundary. No account, database, or external service is required.

## File structure

- `src/app/page.tsx`: application entry.
- `src/app/layout.tsx`: document shell, global styles, and metadata.
- `src/app/api/translate/route.ts`: server-only single-text translation endpoint.
- `src/app/api/translate/batch/route.ts`: server-only batched translation endpoint.
- `src/features/report/report-editor.tsx`: application header, section navigation, properties, preview state, session history, and section actions.
- `src/features/report/model.ts`: portable TypeScript content model, section type definitions, pure foundation checks, and coarse page grouping.
- `src/features/report/sample-report.ts`: isolated demonstration report with numeric prices, variable-length table rows, scenarios, and disclosures.
- `src/features/report/report-blocks.tsx`: reusable page, heading, paragraph, table, scenario, and chart-placeholder renderers.
- `src/features/report/brand.ts`: default publication identity used when an imported report has no brand field.
- `src/styles.css`: semantic OKLCH tokens, workspace styles, publication styles, responsive rules, and print foundations.
- `src/features/report/model.test.ts`: preservation and foundation-check tests.

## Actually implemented

- Document-focused header, ordered section sidebar, multi-page A4-style canvas, document properties, and foundation-check messages.
- Edit report title/date, section titles, paragraph and cover text, scenario text, and table cells. Text commits on blur; changes update the in-memory typed report.
- Add paragraph, heading, scenario, and chart-placeholder sections; duplicate, reorder with arrows, and remove sections. The cover is protected from deletion.
- Select a section, scroll to it, and show its properties. Toggle sidebars on desktop.
- Undo/redo for session edits (last 50 history snapshots), zoom, and read-only preview.
- Foundation checks for missing title, invalid date, duplicate IDs, empty section titles, table-column presence, unknown content, and missing chart slots. These are not full schema or publication validation.
- Print-specific CSS excludes the editor and defines A4, margins, repeated table headers, page breaks, font/image readiness, HTML saving, and browser print/PDF export.
- Gold and Classic white themes can be selected in the workspace and are retained in exported HTML and print output.

## Renderer coverage and Phase 2 infrastructure

The type vocabulary includes cover, heading, paragraph, dashboard, economic-calendar, technical-analysis, fundamental-analysis, scenario, bias-matrix, chart, sources, methodology, risk-disclosure, and unknown. Tables share an explicit column/row contract. Text-oriented sections share a text renderer; scenario and cover have dedicated renderers. Unknown data is retained and shown as escaped JSON. Runtime Zod validation, normalization, a rendering registry, JSON fixtures/import, and canonical-to-editor mapping are implemented.

## Import, translation, and limits

- PDF and JSON import use confirmation, safe rejection, normalization, and unknown-section preservation. PDF text extraction is heuristic and produces review warnings. DOCX/DOC, Markdown, and TXT importing remain out of scope.
- Persistence and autosaving remain out of scope; the editor is still a local session. HTML download and browser print/PDF export are implemented.
- Chart upload, image replacement/removal, and chart generation remain out of scope. Chart slots render a safe missing-image state and report image-load failures.
- English, Spanish, and Arabic interface labels, locale-aware dates, RTL layout, translation adapters, protected financial tokens, completeness warnings, and a server-only configured translation provider are implemented. Failed translations leave the report unchanged. Semantic translation quality still depends on the configured provider and requires human review.
- Authentication, databases, remote storage, live prices, and external integrations.
- Fully measured browser pagination and table-row splitting remain platform-dependent. The current implementation uses controlled editorial grouping, adaptive page breaks, overflow-safe content, and browser print verification; extremely long unbreakable content may still require provider/browser-specific tuning.
- Advanced formatting, table row/column creation, drag reordering, extraction provenance, and exhaustive runtime validation.

All prices, events, and commentary in the sample are illustrative and must not be treated as market information. Web-font loading is optional; local sans-serif fallbacks keep the workspace runnable without it. The established framework dependencies are listed in package.json; the feature modules themselves use React, TypeScript, and standard browser capabilities.
