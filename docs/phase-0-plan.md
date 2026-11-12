# Phase 0 implementation plan

Working breakdown of the Phase 0 checklist in
`House Decay App — Architecture & Roadmap.md`. Each milestone should leave the app
building, type-checking and passing its tests, and should be reviewable on its own.

Dependency order: **M1 → M2 → M3 → M4 → (M5, M6, M7) → M8.**
UI: plain TypeScript + hand-written SVG throughout, no framework (decided 2026-11-12).

## M1. Scaffold
- [x] 1.1 Vite + TypeScript (strict), Vitest, `.gitignore`, `index.html`, entry point
- [x] 1.2 Source layout and layering rules (in `CLAUDE.md`): `src/domain` (pure, DOM-free) now;
  `src/storage`, `src/render`, `src/ui` get created by their milestones
- [ ] 1.3 Web manifest + app icons (placeholder)
- [ ] 1.4 Service worker: precache the built shell (hand-written; no Workbox)

## M2. Domain core (pure TS, no DOM, no storage)
- [x] 2.1 Types: Home, Room, Item, Task, TaskEvent, PauseWindow
- [x] 2.2 Clock + id injection (`Clock`, `fixedClock`, `IdGenerator`)
- [x] 2.3 Event log: event factories, void resolution (`effectiveEvents`)
- [x] 2.4 Decay engine: lastReset, elapsed with pause windows subtracted, pressure, stage
- [x] 2.5 Rollups: item shows its worst task, room shows its worst item
- [x] 2.6 Onboarding seeding: this week / this month / no idea (spread), injected RNG
- [x] 2.7 Default library JSON + validated loader
- [x] 2.8 Unit tests for all of the above

## M3. Storage
- [x] 3.1 `Repository` interface: `loadHouse`, atomic `save` (upsert entities + append events),
  cascading deletes, `exportAll`. The seam sync plugs into later
- [x] ~~3.2 In-memory implementation~~ dropped: tests run the real IndexedDB repository on
  `fake-indexeddb`, so there's one implementation to keep correct
- [x] 3.3 IndexedDB wrapper (`storage/idb.ts`) + IndexedDB repository
- [x] 3.4 Schema versioning: append-only migration list in `storage/schema.ts`
- [x] 3.5 JSON backup: versioned envelope, validated + integrity-checked on import, merge-only
- [x] 3.6 Tests (`fake-indexeddb` as a dev-only dependency)
- [x] 3.7 Shared runtime validators (`domain/validate.ts`), used by the library, backups and later sync
- [x] 3.8 `requestPersistentStorage()` helper (wired up in M4 with the app shell)

## M4. Grid map rendering (UI-framework decision needed here)
- [x] 4.1 Decided: plain TS + SVG throughout
- [ ] 4.2 Map geometry: grid ↔ pixel transforms, room cell rectangles, item footprints and rotation
- [ ] 4.3 SVG layer stack: floor, walls, items, decay, effects, UI (`render/layers`)
- [ ] 4.4 Skin registry: `renderItem(item)` selected by `item.skin`, with an icon skin
- [ ] 4.5 Decay rendering: OKLCH gradient (neutral → amber → red over pressure 0.8 to 1.75), heavier stroke from Overdue on
- [ ] 4.6 Floor tint per room from the implicit floor item
- [ ] 4.7 Pan + pinch-zoom; tap targets of at least 44px

## M5. Icons
- [ ] 5.1 Vendor about 10 MIT SVGs (Tabler or Lucide) into `src/render/icons/` with a LICENSE note
- [ ] 5.2 Map item types in the library to icons

## M6. Completion interaction
- [ ] 6.1 Hit-testing and gesture recognizer (tap vs. long-press)
- [ ] 6.2 One-chore tap → `done` event + restore
- [ ] 6.3 Chore ring (2 to 5 chores, worst first); 6+ falls back to a bottom sheet
- [ ] 6.4 Long-press chore menu: Skip, Done earlier (backdate)
- [ ] 6.5 Undo toast (about 5s) → `void` event
- [ ] 6.6 Restore animation (sparkle) + distinct, quieter skip animation
- [ ] 6.7 Sound: a small set of varied completion sounds via Web Audio
- [ ] 6.8 Room checklist from the room label
- [ ] 6.9 Item details/history view with editable notes

## M7. House entry + onboarding
- [ ] 7.1 Minimal grid editor: add/resize rooms (rectangles), place/move/rotate items
- [ ] 7.2 Add item from library → creates default tasks
- [ ] 7.3 "Last done?" prompt per task → seed events

## M8. Live with it
- [ ] 8.1 Enter the real house
- [ ] 8.2 Daily use for 3 weeks; usage notes in `docs/phase-0-notes.md`
- [ ] 8.3 Tune stage thresholds (they're `DecayConfig`, not constants)

## Decisions made during implementation
- **Voids are not themselves voidable.** Redo = append a fresh `done`. Keeps resolution a single pass.
- **A task with no reset events has unknown pressure** (`null`) and is ignored by rollups,
  rather than being shown as neglected. Onboarding seeding means this should be rare.
- **Pause windows are an input to the engine**, not an event kind yet. Vacation mode is
  deferred past Phase 0; it decides how they're stored. The math is already in place.
- **Deletes keep events.** Deleting a room, item or task cascades down entities but never
  touches the log; orphaned events stay in backups as history.
- **Duplicate event ids are a no-op on append** (first write wins), so re-imports and merges
  are idempotent and an event can never be rewritten.
- **Import only merges.** Entities are upserted (the file wins), events are unioned. There's no
  "replace" mode; restoring into a fresh install is the same operation.
- **Stage thresholds live in `DecayConfig`** so Phase 0 tuning is a config change.
