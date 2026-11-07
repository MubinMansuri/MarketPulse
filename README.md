# MarketPulse Studio

MarketPulse Studio is a browser-based editor for producing **Daily Market Reports**: structured financial briefs with market commentary, dashboards, calendars, analysis, scenarios, sources, and risk disclosures.

The project keeps report content in a typed JSON model, separate from the visual publication layer. Teams can import a report, review and edit its structure, translate eligible English copy, then preview or export an A4-style publication.

> **Important:** MarketPulse Studio is a session-based editorial tool. It does not provide accounts, a database, remote storage, live market data, automatic publishing, or financial advice.

## Features

- Structured editor for report metadata, sections, scenarios, tables, visual slots, sources, and disclosures.
- Gold and Classic themes with responsive and print-focused styling.
- Front and final covers in both themes, including generated covers for imports without a cover block.
- Validated JSON import/export with normalization and preservation of unknown sections.
- Text-based PDF import using lazy-loaded PDF.js extraction and review warnings.
- Standalone HTML download and browser print/PDF export.
- English, Spanish, and Arabic interfaces, including RTL support for Arabic.
- Cache-first DeepL translation with protected financial values, batched misses, and per-language JSON memory.
- Editor controls for adding, duplicating, ordering, removing, previewing, zooming, and undoing session edits.
- Same-origin, validated translation APIs with response hardening and per-instance rate limiting.

## Quick start

### Requirements

- Node.js **20.9+** (CI uses Node.js 24)
- npm

### Install and run

```bash
git clone https://github.com/OWNER/REPOSITORY.git
cd REPOSITORY
npm ci
cp .env.example .env
npm run dev
```

Open [http://localhost:3000](http://localhost:3000).

Translation configuration is optional. The editor, sample report, import flows, preview, and export work without a translation provider. On Windows PowerShell, copy the environment example with:

```powershell
Copy-Item .env.example .env
```

## Commands

| Command              | Purpose                               |
| -------------------- | ------------------------------------- |
| `npm run dev`        | Start the development server.         |
| `npm run build`      | Create an optimized production build. |
| `npm run start`      | Serve the production build.           |
| `npm test`           | Run the Vitest suite.                 |
| `npm run test:watch` | Run tests in watch mode.              |
| `npm run lint`       | Run ESLint.                           |
| `npx tsc --noEmit`   | Type-check without emitting files.    |
| `npm run format`     | Format files with Prettier.           |
| `npm run audit:prod` | Audit production dependencies only.   |

Before a pull request or release, run:

```bash
npm run lint
npm test
npx tsc --noEmit
npm run build
npm run audit:prod
```

## Daily-report workflow

1. Start from the built-in sample or select **Import**.
2. Import a supported JSON report or a text-based PDF; read the review warnings before confirming replacement.
3. Edit report metadata, text, scenario copy, and table cells. Use **Add section** for supported report blocks.
4. Reorder, duplicate, or remove regular sections. Cover blocks are protected.
5. Choose Gold or Classic, review foundation checks, and use **Preview** for a publication-focused view.
6. Optionally configure a provider, select Spanish or Arabic, and choose **Translate report**.
7. Download standalone HTML or use the browser print flow to save a PDF.

Edits live only in React session state for the current tab. Reloading or closing the tab discards them unless the report has been exported or retained as an imported file.

### Imports

| Format | Current behaviour                                                                                                                                                               |
| ------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| JSON   | Validated, normalized, staged for review, and imported into the canonical report model. Unknown sections are retained.                                                          |
| PDF    | Text and approximate layout are extracted with PDF.js. Headings and tables are inferred; source visuals may be captured. Scanned or image-only PDFs require OCR before editing. |

PDF conversion is heuristic, not lossless. Check the source before publication, particularly tables, prices, dates, reading order, visuals, and disclosures.

## DeepL and cache-first translation

MarketPulse Studio translates English report text to Spanish (`es`) or Arabic (`ar`). Financial identifiers, prices, dates, percentages, and configured terminology are protected before a provider request. A failed translation keeps the source report unchanged and returns a reviewable message.

When `TRANSLATION_PROVIDER=deepl`, the workflow is:

```text
Translate action
  → language JSON memory (`locales/es.json` or `locales/ar.json`)
  → DeepL only for unique cache misses
  → atomic update of the language file
  → translated report in the editor
```

The memory key is a SHA-256 hash of protected source text, while each entry stores the source, translation, and update time. Duplicate strings are de-duplicated, misses are grouped by target locale, and DeepL requests are batched up to 40 texts. Repeated text therefore uses local memory instead of consuming another API request.

The default memory directory is `locales/`; set `TRANSLATION_MEMORY_DIR` to use another writable location. Memory files can contain report copy. Do not expose them through `public/`, store secrets in them, or commit confidential content.

### DeepL API Free

```dotenv
TRANSLATION_PROVIDER=deepl
TRANSLATION_API_URL=https://api-free.deepl.com
TRANSLATION_API_KEY=your-deepl-api-free-key
TRANSLATION_MEMORY_DIR=locales
```

### DeepL API Pro

```dotenv
TRANSLATION_PROVIDER=deepl
TRANSLATION_API_URL=https://api.deepl.com
TRANSLATION_API_KEY=your-deepl-api-pro-key
TRANSLATION_MEMORY_DIR=locales
```

Use a DeepL API Free or API Pro authentication key; a translator subscription alone is not an API key. Credentials remain server-only and must never use a `NEXT_PUBLIC_` prefix.

The implemented alternative adapters are `libretranslate`, `mymemory`, `free-translate-api`, and `openai-compatible`. See [`.env.example`](.env.example) for their exact variables and examples. `openai-compatible` additionally uses `TRANSLATION_MODEL`; MyMemory may use `TRANSLATION_MYMEMORY_EMAIL`.

File-backed memory is durable only on a host with a writable persistent volume. On ephemeral serverless filesystems, warm instances can still cache in memory, but shared durable memory requires external persistent storage; this repository does not ship that adapter.

### Environment variables

| Variable                     | Required                 | Description                                                                  |
| ---------------------------- | ------------------------ | ---------------------------------------------------------------------------- |
| `TRANSLATION_PROVIDER`       | For translation          | Provider such as `deepl` or `libretranslate`; LibreTranslate is the default. |
| `TRANSLATION_API_URL`        | Provider-dependent       | Provider URL. DeepL receives `/v2/translate` automatically when needed.      |
| `TRANSLATION_API_KEY`        | Provider-dependent       | Server-only API key; required by DeepL.                                      |
| `TRANSLATION_MEMORY_DIR`     | No                       | Writable DeepL language-memory directory; defaults to `locales`.             |
| `TRANSLATION_MODEL`          | `openai-compatible` only | Model identifier for that adapter.                                           |
| `TRANSLATION_MYMEMORY_EMAIL` | No                       | Optional MyMemory contact email.                                             |

## Architecture

The app uses the Next.js App Router. `src/app/page.tsx` mounts the client editor; report content, renderers, importing, and translation remain in the report feature.

```text
src/
├── app/
│   ├── page.tsx                     # Application entry
│   ├── layout.tsx                   # Document shell and global styles
│   └── api/translate/               # Server-only translation endpoints
│       ├── route.ts                 # Single-text route
│       └── batch/route.ts           # Batched route
├── components/ui/                   # Shared UI primitives
├── features/report/
│   ├── report-editor.tsx            # Workspace and session state
│   ├── model.ts                     # Canonical model, checks, page grouping
│   ├── report-blocks.tsx            # Publication renderers
│   ├── sample-report.ts             # Demonstration fixture
│   ├── report-mapping.ts            # Import/editor mapping
│   ├── report-registry.ts           # Section definitions
│   ├── pdf-import.ts                # PDF.js extraction and mapping
│   ├── json-import.worker.ts        # JSON import worker
│   ├── translation.ts               # Client translation orchestration
│   ├── translation.server.ts        # Provider adapters and batching
│   ├── translation-memory.server.ts # Per-language file memory
│   ├── locale.ts                    # Labels, dates, and RTL helpers
│   └── terminology.ts               # Protected financial terminology
├── lib/api-security.ts              # API security helpers
└── styles.css                       # Visual, responsive, and print tokens

locales/
├── es.json                          # Spanish translation memory
└── ar.json                          # Arabic translation memory
```

The report model includes covers, headings, paragraphs, dashboards, economic calendars, technical and fundamental analysis, scenarios, bias matrices, chart placeholders, sources, methodology, risk disclosures, dividers, spacers, and unknown content. Tables use explicit columns and rows.

### Boundaries

- The browser calls only same-origin `/api/translate` and `/api/translate/batch` routes.
- Zod validates API input; routes reject cross-origin requests and apply an in-process IP limiter.
- Provider credentials are read only on the server.
- All visual and print tokens remain in `src/styles.css` so editor and publication stay aligned.
- Page grouping is editorial rather than a measured browser-pagination guarantee. Review long reports in the final print output.

## Technology

| Area           | Technology                                                |
| -------------- | --------------------------------------------------------- |
| Framework      | Next.js 16, React 19, TypeScript                          |
| Validation     | Zod                                                       |
| PDF extraction | `pdfjs-dist`                                              |
| UI primitives  | Radix Dialog, Lucide                                      |
| Styling        | Global CSS tokens; Tailwind/PostCSS tooling is configured |
| Testing        | Vitest, Testing Library, jsdom                            |
| Quality        | ESLint, Prettier, TypeScript                              |
| CI             | GitHub Actions                                            |
| Deployment     | Vercel Node.js runtime or a compatible Node.js host       |

Exact versions are in [`package.json`](package.json).

## Security and deployment

The repository configures security headers, same-origin translation routes, input limits, no-store API responses, and per-instance rate limiting. These controls do **not** replace shared edge protection.

Before public deployment:

1. Configure a shared, IP-based edge WAF/rate limit for both translation routes.
2. Add provider credentials through the host's environment settings.
3. Verify deployed security headers and rate limiting.
4. Use durable storage if translation memory must survive restarts and be shared by instances.
5. Test the themes, imports, translation, and print flow against the deployment.

See [DEPLOYMENT.md](DEPLOYMENT.md) for the Vercel workflow and [SECURITY.md](SECURITY.md) for required WAF, header, and dependency-risk checks.

## Contributing

Contributions are welcome. Keep pull requests focused, tested, and consistent with the separation between canonical content and presentation.

1. Branch from `main`.
2. Install with `npm ci`.
3. Make the change without committing secrets, generated output, or private report content.
4. Add or adjust focused tests for behaviour changes.
5. Run the validation commands listed above.
6. Open a pull request with the problem, implementation, validation, and known limitations.

### Project conventions

- Keep the route entry in `src/app/page.tsx` and the editor in `src/features/report/report-editor.tsx`.
- Keep canonical types and foundation checks in `model.ts`, fixtures in `sample-report.ts`, and publication renderers in `report-blocks.tsx`.
- Keep visual and print tokens in `src/styles.css`.
- Do not imply persistence or autosave unless it is implemented.
- Preserve unknown imported sections rather than silently dropping data.
- Do not weaken token protection, input validation, same-origin checks, or rate limits.

GitHub Actions validates pushes and pull requests to `main` with linting, tests, type-checking, a production build, and a production dependency audit. Dependabot checks npm and GitHub Actions dependencies weekly.

## Limitations and roadmap

The next major editorial improvement is measured pagination and broader print verification for unusually long content. See [roadmap.md](roadmap.md).

- PDF import is heuristic and is not OCR or a layout-fidelity guarantee.
- Browser PDF output depends on browser and printer behaviour.
- Chart generation and full asset management are not included.
- Translation quality is provider-dependent and needs human editorial/financial review.
- Translation memory is file-backed, not a shared database.

## License

No open-source license file is currently included. Before public release, project maintainers should add a `LICENSE` file stating the intended terms. Until then, do not assume permission to reuse, redistribute, or contribute code beyond the owner's stated terms.

## Financial and content disclaimer

MarketPulse Studio is a publishing and editing tool, not investment, legal, tax, accounting, or other professional advice. All sample prices, events, scenarios, and commentary are illustrative and may be incomplete, delayed, or inaccurate. Users must independently verify market information, obtain appropriate professional review, comply with applicable law, and include appropriate disclosures before distribution.

Review every translated, imported, and exported report before it is published or used in a financial decision.
