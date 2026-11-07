## Architecture rules
- Keep the application entry at `src/app/page.tsx` and the editor in `src/features/report/report-editor.tsx`; this preserves Next.js App Router routing and separates the workspace from routing.
- Keep canonical types and pure foundation checks in `model.ts`, fixture data in `sample-report.ts`, and publication renderers in `report-blocks.tsx`; content must evolve independently of presentation.
- Keep all visual and print tokens in `src/styles.css`; the workspace and publication must share a coherent configurable design system.
- Keep Phase 1 edits in React session state with honest unsaved status; persistence, import, translation, and export must not be implied until implemented.
- Treat current page grouping as coarse editorial grouping, not production pagination; future measured pagination must preserve content without clipping.
