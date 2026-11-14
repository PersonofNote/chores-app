# House Monitor

Offline-first PWA: a top-down map of a real house where items visibly decay and recover.
Design: `House Decay App — Architecture & Roadmap.md`. Current work: `docs/phase-0-plan.md`
(update its checkboxes and "Decisions" section as milestones land).

## Commands
- `npm test` / `npm run test:watch`: Vitest
- `npm run typecheck`, `npm run build`, `npm run dev` (dev seeds a demo house into an empty DB; `?empty` uses a scratch DB, wiped each load, to try first run)
- `npm run screenshot -- http://localhost:5173/ out.png [light|dark]`: headless-Chrome
  screenshot plus console output, for checking rendering changes (`scripts/cdp.mjs` is the
  shared DevTools-protocol helper for such scripts)
- `npm run icons`: re-render the PNG app icons after editing `public/icons/icon.svg`
- Service worker: only in production builds. Test with `npm run build && npx vite preview`.
  It's generated from `build/sw.template.js` by the plugin in `build/service-worker.ts`

## Architecture rules
- `src/domain` is pure TypeScript: no DOM, no IndexedDB, no `Date.now()` or `Math.random()`.
  Inject `Clock`, `IdGenerator` and `Random`. Other layers import from `src/domain/index.ts`.
- The event log is append-only and the source of truth. Never store decay state; derive it
  (`computeHouseStatus`). Undo is a `void` event, never a delete.
- Layering: `domain` ← `storage` ← `state` ← `render` / `ui` ← `app.ts`. Nothing imports upward;
  `render` never imports `state` or `ui`.
- Layout rules live in `src/domain/layout.ts`, chore rules in `src/domain/tasks.ts`; the UI
  (`src/ui/editor`, `src/ui/chore-editor.ts`) proposes, the rules decide, and `HouseStore`
  re-checks before saving.
- All writes from the UI go through `HouseStore` (`src/state`). React to changes by
  subscribing; completion animations and sound are wired that way (`ui/feedback.ts`).
- UI is plain TypeScript + hand-written SVG. No UI framework.
- Storage goes through `Repository` (`src/storage`). Untrusted data (imports, later sync)
  is validated with `src/domain/validate.ts` before it reaches storage.
- Minimal runtime dependencies (aim for zero). Vendor assets instead of adding packages.
  Dev-only dependencies are fine when clearly worth it.
- Everything visual must reflect real upkeep (design principle 1, "reality coupling").

## Conventions
- TS strict with `exactOptionalPropertyTypes`: omit optional fields; don't set them to `undefined`.
- Tests live next to the code as `*.test.ts`. Shared fixtures: `src/domain/test-helpers.ts`,
  `src/storage/test-fixtures.ts`, `src/ui/test-app.ts` (fully wired UI over the demo house).
  DOM tests opt in with `// @vitest-environment happy-dom`.
- Icons are vendored Lucide SVGs in `src/render/icons/lucide/` (see its README to add one).
- Map styling: skins stroke with `currentColor` and `var(--item-stroke)`; never set decay
  colors inside a skin.
