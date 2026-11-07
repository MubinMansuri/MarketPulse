# MarketPulse Studio

A browser-based financial report editor built with Next.js, React, and TypeScript. The default Gold theme follows the supplied 18 September 2026 reference PDF: black and gold cover, compact black mastheads, gold section labels, restrained tables, and print-friendly A4 pages. The theme selector also restores the original Classic white and green design. The included report uses illustrative data.

## Run locally

```sh
npm install
npm run dev
```

Run `npm test`, `npm run lint`, and `npm run build` before deployment. The Next app entry is `src/app/page.tsx`; the editor is `src/features/report/report-editor.tsx`. Report types and validation live in `model.ts`, sample content in `sample-report.ts`, presentation blocks in `report-blocks.tsx`, and all visual and print tokens in `src/styles.css`.

## Current capabilities

- Edit report metadata, section text, scenarios, and table cells; add, reorder, duplicate, and remove sections.
- Set the publication brand per report; the name and initial appear in the cover, page headers, and footers of HTML and printed PDF output.
- Undo and redo session edits, preview, zoom, and inspect foundation checks.
- Switch between Gold and Classic white themes; the selected theme is used for HTML and print output.
- Import JSON or text-based PDF with a review and replacement confirmation. PDF extraction is heuristic and should be checked against the source before publication.
- Download a standalone HTML report or use the browser print dialog to save a PDF.
- Switch interface language between English, Spanish, and Arabic. Translate an English report through a configured server provider; financial values are protected and provider failures leave the report unchanged.

The editor keeps changes only in the current tab. It does not provide autosave, accounts, a database, chart uploads, or guaranteed measured pagination. Browser print output should be reviewed for long tables and unusual content. To configure translation, copy `.env.example` to `.env` and set a server provider. Translation quality requires human review.


