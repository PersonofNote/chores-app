# House Monitor

Offline-first PWA: a top-down map of a real house where items visibly decay and recover.
Design: `House Decay App — Architecture & Roadmap.md`. Current work: `docs/phase-0-plan.md`
(update its checkboxes and "Decisions" section as milestones land).

## Commands
- `npm test` / `npm run test:watch`: Vitest
- `npm run typecheck`, `npm run build`, `npm run dev` (dev seeds a demo house into an empty DB)
- `npm run screenshot -- http://localhost:5173/ out.png [light|dark]`: headless-Chrome
  screenshot plus console output, for checking rendering changes

## Architecture rules
- `src/domain` is pure TypeScript: no DOM, no IndexedDB, no `Date.now()` or `Math.random()`.
  Inject `Clock`, `IdGenerator` and `Random`. Other layers import from `src/domain/index.ts`.
- The event log is append-only and the source of truth. Never store decay state; derive it
  (`computeHouseStatus`). Undo is a `void` event, never a delete.
- Layering: `domain` ← `storage` ← `render` / `ui` ← `main.ts`. Nothing imports upward.
- UI is plain TypeScript + hand-written SVG. No UI framework.
- Storage goes through `Repository` (`src/storage`). Untrusted data (imports, later sync)
  is validated with `src/domain/validate.ts` before it reaches storage.
- Minimal runtime dependencies (aim for zero). Vendor assets instead of adding packages.
  Dev-only dependencies are fine when clearly worth it.
- Everything visual must reflect real upkeep (design principle 1, "reality coupling").

## Conventions
- TS strict with `exactOptionalPropertyTypes`: omit optional fields; don't set them to `undefined`.
- Tests live next to the code as `*.test.ts`. Shared fixtures: `src/domain/test-helpers.ts`,
  `src/storage/test-fixtures.ts`. DOM tests opt in with `// @vitest-environment happy-dom`.
- Icons are vendored Lucide SVGs in `src/render/icons/lucide/` (see its README to add one).
- Map styling: skins stroke with `currentColor` and `var(--item-stroke)`; never set decay
  colors inside a skin.
