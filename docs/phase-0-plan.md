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
- [x] 1.3 Web manifest + app icons: one SVG source, PNGs rendered by `scripts/render-icons.mjs`
  (headless Chrome, so they're reproducible); iOS meta tags; relative base so any host path works
- [x] 1.4 Service worker (hand-written; no Workbox): a Vite build plugin injects the exact list
  of built files and a content hash; cache-first shell, old caches cleaned on activate
- [x] 1.5 Updates: a new version waits, the app shows "Update available · Reload"; reload only
  when you choose, never mid-use. Not registered in dev
- [x] 1.6 Verify in Chrome: installable manifest, controlled page, works offline after first load

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

## M4. Grid map rendering
- [x] 4.1 Decided: plain TS + SVG throughout
- [x] 4.2 Geometry (pure): grid → user units, item footprints with rotation, room wall outline
  from the union of its rectangles (so L-shapes get one outline), bounds
- [x] 4.3 Decay style (pure): OKLCH ramp neutral → amber → red over the `DecayConfig`
  thresholds, heavier stroke from Overdue on, light/dark palettes, floor tint
- [x] 4.4 Viewport math (pure): fit to bounds, zoom about a point, pan, screen ↔ content
- [x] 4.5 SVG helper + skin registry: resolve `item.skin` → `<type>.icon` → placeholder skin.
  Skins draw with `currentColor` and `--item-stroke`, so decay never touches skin code
- [x] 4.6 `MapView`: builds the layer stack once (`setHouse`), then applies decay in place
  (`setStatus`) so M6 animations have stable nodes; hit targets at least 44 CSS px
- [x] 4.7 Viewport controller: pointer-event pan, pinch-zoom, wheel/trackpad zoom
- [x] 4.8 App shell: styles + dark mode, load the house, refresh decay periodically and on
  focus, request persistent storage; dev-only demo house when the database is empty
- [x] 4.9 Tests: pure modules in node; `MapView` under `happy-dom` (dev-only)
- [x] 4.10 Visual check: `npm run screenshot -- <url> <out.png> [light|dark]` (headless Chrome via CDP)

Known follow-ups found in M4:
- Room labels sit in the top-left corner and can overlap items there (they have a halo for now).
  Revisit placement in M7, when the editor knows where items are.

## M5. Icons
- [x] 5.1 Vendor 12 Lucide SVGs (ISC) into `src/render/icons/lucide/` with LICENSE + README.
  Lucide over Tabler: it covers more item types (toilet, shower, washer, smoke alarm, vent),
  and one set keeps the line style consistent
- [x] 5.2 Allowlist parser (`icons/parse.ts`): shapes + geometry attributes only
- [x] 5.3 Icon skin: icon fitted to the footprint, stroke compensated for scale so line weight
  equals `--item-stroke`; faint footprint outline so multi-cell items read at their real size
- [x] 5.4 Map item types to icons; `createDefaultSkins()` wires them into the app
- [x] 5.5 Tests: parser allowlist, every library type has an existing icon, no unused icon files

## M6. Completion interaction
Foundations first, so every completion path (tap, ring, checklist) animates and undoes the same way.
- [x] 6.1 `HouseStore` (`src/state`): in-memory house, writes through `Repository`, notifies
  subscribers with what changed. The app recomputes decay on every change
- [x] 6.2 Gestures: resolve the tapped thing (item / floor / room label); tap vs. long-press
  recognizer independent of the viewport (shares `DRAG_THRESHOLD`); right-click = long-press
- [x] 6.3 Effects driven by store changes: restore (decay color transitions back, a small pop,
  sparkle), skip (quieter pulse, no sparkle); `prefers-reduced-motion` respected
- [x] 6.4 Sound: a few short synthesized chimes via Web Audio (no audio files); skip is softer
- [x] 6.5 Undo toast (about 5s) → `void` events; a new toast replaces the old one
- [x] 6.6 One-chore item: tap → `done`
- [x] 6.7 Chore ring for 2 to 5 chores: HTML overlay over the item, worst first, follows pan/zoom,
  stays open for more logging; floor tap opens the floor's ring; 6+ chores → sheet list
- [x] 6.8 Sheet component + chore menu on long-press: Skip, Done earlier, History
- [x] 6.9 Room checklist from the room label: due chores pre-checked, one confirm
- [x] 6.10 Item details: notes (editable), history newest first, voided hidden, filter by chore
- [x] 6.11 Tests: store, gestures, layout, formatting, toast, feedback wiring, and a controller
  integration suite over the demo house (`src/ui/test-app.ts`); flows checked in real Chrome

Known follow-ups found in M6:
- Map items aren't keyboard-reachable yet (SVG hit targets aren't focusable). Overlay UI
  (ring, sheets, toast) is real buttons and dialogs, so it is.
- ~~No way to mute sound yet~~: done before M8 (Settings → Sound).
- One-tap completion's feel is the doc's open question; judge it during M8 before
  considering press-and-hold.

## M7. House entry + onboarding
Scope guard (the doc's "editor rabbit hole" risk): grid rectangles only. No freeform shapes,
wall drawing or SVG import. Rooms are rectangles (several make an L); items snap to cells.
- [x] 7.1 Layout rules, pure (`domain/layout.ts`): in bounds, rooms don't overlap each other,
  items sit fully inside one room and don't overlap other items, free-spot search, room at a cell
- [x] 7.2 Store layout ops: add/update/delete room (with its floor item) and item (with default
  tasks), update home; a `layout` change rebuilds the map
- [x] 7.3 "Last done?" sheet after adding an item or room: this week / this month / no idea
  per chore → seed events. Closing it counts as "no idea", so nothing is left unseeded
- [x] 7.4 Room labels avoid items: first free corner of the room (M4 follow-up)
- [x] 7.5 First run: name the home and pick a grid size. Dev: `?empty` skips the demo house
- [x] 7.6 Edit mode shell: Edit/Done, grid lines, gestures routed to the editor, selection
  outline, contextual toolbar; the viewport ignores pointers the editor claims for dragging
- [x] 7.7 Rooms: add (name quick picks), select, drag to move (its items come along), corner
  handles to resize, add a section for L-shapes, rename, delete (confirm)
- [x] 7.8 Items: add from a library picker with icons, auto-placed in the selected room, drag to
  move (may change room), rotate, delete (confirm)
- [x] 7.9 House sheet: rename, grid size, export / import backup (the M3 backup gets its UI)
- [x] 7.10 Tests + browser check

Known follow-ups found in M7:
- No undo in the editor (deletes ask for confirmation; moves are easy to redo by hand).
- In a crowded room with no free corner, the label falls back to the top-left over an item.
- Export/import were exercised through their tested functions and a click in Chrome, but a
  full round trip through the file picker needs a manual check on a real device.

## Before M8: getting a house onto the phone
- [x] Settings opens from the map (and the editor's top bar), not only from edit mode: house
  name and size, sound, backup. Lives in `ui/settings.ts`, shared by both
- [x] Mute: Settings → Sound, a per-device preference (`ui/preferences.ts`)
- [x] Welcome screen offers "Restore from backup…", so a house drawn on a computer can be moved
  to the phone without first creating a placeholder house (`restoreHouse` in `storage/backup.ts`)
- [x] Furniture: closet, counter, dresser, table, desk, shelf and cabinet (2 × 1 each) and chair
  (1 × 1) in the library, with Lucide icons shirt, spray-can, archive, utensils, lamp-desk,
  library-big, columns-2 and armchair. Counters suggest cabinet chores (kitchen cabinets sit
  under the counter on the map); freestanding storage (armoire, pantry, sideboard) is a
  cabinet with a name
- [x] Edit chores per item: rename, change how often (presets or custom days), add (with
  suggestions from the library and a "Last done?" choice), remove. Opens from an item's details
  (long-press; floors too) and from the editor's item toolbar. Rules in `domain/tasks.ts`,
  UI in `ui/chore-editor.ts`
- [x] Resize items: a selected item has corner handles like a room (`resize-item` in
  `ui/editor/drag.ts`); the layout rules already covered any size. Icons stop growing past
  2 cells (`MAX_ICON_CELLS`), so a big bed is a big outline with a normal icon
- [x] Name items: optional `Item.name` ("Armoire", "Guest bed"), falling back to the type's
  label (`itemName`). Rename from the editor's item toolbar or the details sheet
  (`ui/item-name.ts`); floors keep "Kitchen floor"

## M8. Live with it
- [ ] 8.0 Host it over HTTPS (service workers need it; any static host works, the build uses
  relative paths). On iOS, add to Home Screen *before* entering data: the installed app's
  storage is separate from Safari's
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
- **Decay reaches skins through CSS custom properties** (`--decay-color`, `--item-stroke`) on
  the item group. Skins stroke with `currentColor`, so new art never handles decay.
- **The `decay` layer exists but is empty in the MVP.** Color lives on the item; the layer is
  reserved for sprite overlays so adding them later doesn't reorder the stack.
- **The floor item is never drawn.** Items of type `floor` only drive their room's tint.
- **Dev builds seed a demo house** into an empty database (`src/dev/demo-house.ts`, excluded
  from production builds). Clear site data in the browser to reset it.
- **Writes are save-then-show.** `HouseStore` persists to IndexedDB before updating memory and
  notifying, so the UI never shows unsaved state. Writes take milliseconds, so it feels instant.
- **Feedback subscribes to the store**, not to buttons: every completion path animates and
  sounds the same, and one action (e.g. a room checklist) plays one sound.
- **While the ring is open, any tap on the map only closes it**, even a tap on another item,
  so a stray tap never logs a chore by accident.
- **Sounds are synthesized** (Web Audio), not audio files: pentatonic motifs in a random key,
  never the same motif twice running.
- **Items don't overlap**, and sit entirely inside one room; rooms don't overlap each other.
  Enforced in `domain/layout.ts` and re-checked by `HouseStore` before any layout write.
- **Moving an item across a wall moves it to that room.** Moving a room carries its items.
- **Drags only pass through valid layouts**: the preview stops at the last valid spot and
  that's what's saved on release.
- **Every new room/item gets the "Last done?" sheet; closing it means "no idea"**, so nothing
  starts with unknown decay.
- **Outside edit mode the view frames the rooms**, not the whole grid.
- **The service worker registers at startup**, before first run, so the app is cached for
  offline use from the first visit. It's production-only; dev never registers one.
- **Updates wait for a tap** ("Update available · Reload"); the page never reloads on its own.
- **Build-side code lives in `build/`** (Node, `tsconfig.node.json`); app code stays in `src/`.
- **Import only merges.** Entities are upserted (the file wins), events are unioned. There's no
  "replace" mode; restoring into a fresh install is the same operation.
- **Device preferences (sound) live in `localStorage`, not the database.** They describe the
  device, not the house, so they stay out of backups and don't travel with a restore.
- **Moving a house between devices is export then restore**, a one-time copy rather than
  sync. Import into a device that already has a *different* house adds a second home, and the
  app has no way to choose between homes yet (it opens the first). Restore on a fresh install
  avoids that.
- **Chores belong to items, not types.** The library only supplies a new item's starting
  chores and suggestions; after that each item's chores are its own. Changing the library
  doesn't touch items already placed.
- **Chore names are unique per item** (ignoring case and spacing), so history and the ring stay
  unambiguous. The same name on two items is fine.
- **Removing a chore keeps its events** in the database and backups, like deleting an item. Its
  history isn't shown any more; re-adding the same name starts a new chore.
- **A new chore is saved together with its "Last done?" seed** (one write), so it never shows as
  unknown, even briefly.
- **Chore edits are their own store change (`tasks`)**: the map restyles decay without a rebuild,
  and an open ring refreshes (or closes, if the item no longer has 2–5 chores).
- **An item's size is its own.** The library size is only where a new item starts, like its
  chores. `size` stays the unrotated footprint, so resizing a turned item swaps the result back.
- **A new item type only when its chores differ.** Looks (armoire vs dresser) are a skin, and
  telling two alike apart is a name. Kitchen cabinets ride on the counter (cabinet chores as
  counter suggestions) because they'd overlap it on a top-down grid.
- **Stage thresholds live in `DecayConfig`** so Phase 0 tuning is a config change.
