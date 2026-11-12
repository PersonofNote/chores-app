# House Decay App — Architecture & Roadmap

Nov 12, 2026 · @Jessie

## Vision

A top-down map of your real house where every item decays visibly and recovers when you tend it: the farming-sim loop, applied to actual chores and long-interval maintenance.

**Core hypothesis:** maintenance sticks when you are attached to the thing being maintained. Decay timers alone do not create that attachment. Tody already ships the decay mechanic, and as a plain list it became an overdue list with no satisfaction in tapping "done."

Where attachment comes from in this app:

- **Authorship.** You build the map of your own home, so it is yours before the first task.
- **Decay shown on the object.** The bed looks rumpled; there is no "3 days overdue" text.
- **A satisfying restore.** Tapping an item plays a visible, audible recovery.
- **Knowing your house over time.** The catalog fills in and each item builds up a history.

**Scope:** personal tool and content source first. Built with productization in mind, to a reasonable degree: the data model and sync story should not need a rewrite to support households.

**Out of scope for now:** calendar-anchored chores (trash day), chore assignment and rotation, points and streaks.

## Design principles

Every feature is checked against principle 1 first.

1. **Reality coupling.** Anything new on the map must exist in the real house. Any change in how the map looks must reflect real upkeep. No fake progression, no pets or decor that are not real.
2. **Decay is shown on the object, not as text.** In the MVP, a color gradient on the item's line drawing. Later, sprites and overlays (dust, cobwebs, grime, wilting) on the item itself. No overdue counters and no "20 tasks overdue" screens.
3. **Neglect is recoverable.** Decay visuals cap at a worst stage. One good session restores most of the house. A gentle reset option exists for coming back after a gap.
4. **Completion feels good.** Every restore has animation and sound. Checkbox-only completion is a bug.
5. **Growth comes only from real things.** A more complete catalog, item histories, seasonal bundles finished, real upgrades added to the map, and atmosphere driven by real overall upkeep. Stats are additive, never punitive: retrospective facts about real care ("sheets washed 48 times this year"), no streaks that reset and no points.
6. **Logging is near-instant.** One tap from the map. Later: NFC or QR tags on the items themselves.
7. **Minimal dependencies.** Vendor assets rather than adding runtime packages. Take a dependency only when the tradeoff is clearly worth it.
8. **Ship over polish.** Art is the biggest rabbit-hole risk. Icons first; the art layer can be swapped later without touching the model.

## Competitive landscape

The decay mechanic is proven and taken. A spatial, object-based map of your real house that covers whole-home maintenance is not.

| App | What it does | Gap vs. this app |
| --- | --- | --- |
| [Tody](https://apps.apple.com/us/app/-/id595339588) | Need-based indicators that show dirtiness instead of due dates; a mascot (Dusty); household sync. About 1.5M Android installs. | A list, not a place. Focused on cleaning. |
| [Sweepy](https://sweepy.com/) | Room-by-room cleanliness bars, household leaderboard, approval for kids' tasks. | Room bars, no map. Heavy setup. |
| [TidyFlow](https://apps.apple.com/st/app/id6767477316) | Released May 2026. Rooms placed on a visual home map; standard recurring schedules. | Room blocks, not objects. No decay visuals. |
| [Donetick](https://github.com/donetick/donetick) | Open-source, self-hosted. Rotation, points, NFC triggers, PWA. | Utility UI, no spatial view. |
| Grocy | Self-hosted household system; interval chores plus appliance and battery tracking. | Utility UI, chores are one module of many. |

**Differentiation:**

- Your real floorplan, with items placed where they are.
- Objects as the unit: tap the bed, not a task row.
- Long-interval maintenance (filters, gutters, smoke detectors, water heater) as a first-class use case, not only cleaning.
- A cozy-game feel held to the reality-coupling rule.

Landscape as of 2026-11-12.

## Domain model

The hierarchy is Home → Room → Item → Task. Completions are an append-only event log, and all decay state is derived from it, never stored.

```ts
type Home = { id: string; name: string; gridSize: { w: number; h: number } }

type Room = {
  id: string; homeId: string; name: string
  cells: { x: number; y: number; w: number; h: number }[] // one or more rectangles, so L-shapes work
}

type Item = {
  id: string; roomId: string
  type: string            // 'bed', 'fridge', 'hvac-filter': drives default tasks
  skin: string            // 'bed.icon' now; 'bed.wood-queen' later
  tint?: string           // reserved for the sprite phase; color carries decay in the MVP
  cell: { x: number; y: number }
  size: { w: number; h: number }
  rotation: 0 | 90 | 180 | 270
  notes?: string          // model number, filter size, warranty: the item's history
}

type Task = {
  id: string; itemId: string; name: string
  intervalDays: number
  kind: 'interval'        // MVP only; 'calendar' | 'seasonal' later
  bundleId?: string       // seasonal bundles, Phase 3
}

type TaskEvent = {
  id: string              // UUID, so merging across devices is trivial
  taskId: string
  kind: 'done' | 'skip' | 'seed' | 'void'  // seed = onboarding "last did this..."
  at: string              // when it happened (ISO); backdatable via Done earlier
  recordedAt: string      // when it was logged; separates honest backdating from gaming
  by?: string             // user id, once households exist
  voids?: string          // on a 'void' (undo): id of the event it cancels
  note?: string
}
```

**Decay math.** For each task: `lastReset = max(at)` over its done, skip and seed events, and `pressure = elapsed days / intervalDays`. Pause windows (vacation mode) are subtracted from elapsed time. An item shows its worst task, and a room shows its worst item.

| Stage | Pressure | MVP (line drawing) | Later (sprites) |
| --- | --- | --- | --- |
| Fresh | under 0.5 | Neutral stroke, brief sparkle after a restore | Clean sprite + sparkle |
| Fine | 0.5 to 0.8 | Neutral stroke | Clean sprite |
| Due soon | 0.8 to 1.0 | Gradient shifts toward amber | Light dust overlay |
| Overdue | 1.0 to 1.75 | Amber to red, plus heavier stroke | Grime, cobwebs |
| Neglected | 1.75 and up | Full red, capped | Worst overlay, capped |

Thresholds are starting guesses to tune in Phase 0. In the MVP the color follows pressure continuously between 0.8 and 1.75; the stages still drive non-color cues and, later, sprite swaps.

**Onboarding seeding.** When an item is added, each task asks "last done?" with this week / this month / no idea. "No idea" seeds a spread of random offsets so the house does not all come due on the same day.

**Default library.** A JSON file mapping item type to default tasks and intervals. It covers both cleaning (sheets every 7 days) and long-interval maintenance (HVAC filter every 90 days, smoke detector test every 30 days, water heater flush every 365 days).

## System architecture

An offline-first PWA with a pure TypeScript domain core and IndexedDB storage. The append-only event log is the source of truth from day one, so syncing households later is additive, not a rewrite.

&#91;embedded content: architecture · 3 layers, event log at the core\]

The app never stores a decay stage: it writes events and derives everything else. Dashed parts are later phases and plug into the same log.

**Stack**

- **Language:** TypeScript. Vite as a dev-only build tool; minimal runtime dependencies.
- **Rendering:** hand-written SVG for the map. Forms and panels use either vanilla TS or a tiny framework (see Open decisions).
- **Storage:** IndexedDB through a thin, self-written wrapper. Entities are edited in place; events are only ever appended.
- **Offline and install:** service worker + web manifest. Installed to the home screen on iOS, which Phase 2 push needs anyway.
- **Testing:** the decay engine is pure functions with an injected clock, so stage logic is unit-tested without waiting days.

**Why an event log**

- Item histories come for free: the log already is the history.
- Merging devices is a set union of events keyed by UUID, with no CRDT library. A task's state is `max(at)` over its events, which never conflicts.
- Vacation mode, skips and onboarding seeds are all just event kinds.
- At household scale (thousands of events per year) no snapshots are needed.

**Backup.** JSON export and import ships in Phase 0. Local-only data needs a way out before it holds anything you care about.

## Rendering and art pipeline

Icons on a grid now, tiles later. Because of a single renderer seam and decay overlays kept as their own layer, the switch should take days of code, plus art time.

**Grid first.** Rooms are rectangles of cells, and items snap to cells with a footprint. This is the decision that keeps icons and tiles interchangeable. Freeform pixel placement would force a rewrite later.

**Pure top-down view.** Not ¾ perspective, which avoids depth sorting and sprites that spill into neighboring cells.

**Layer stack** (SVG, bottom to top):

1. Floor: plain fill now, floor tiles later
2. Walls: plain SVG strokes. Autotiled walls are deferred (a known rabbit hole)
3. Items: `renderItem(item) → <g>`, chosen by `item.skin`
4. Decay overlays: `renderDecay(item, stage) → <g>`, a stroke color gradient in the MVP; generic overlay sprites sized to the footprint later
5. Effects: restore sparkle and similar animation
6. UI: selection, editor handles

**Icon phase.** Copy the needed MIT-licensed SVGs (Tabler or Lucide) into the repo as files, with no runtime package. Decay is a continuous color gradient on the item's strokes, from neutral through amber to red, interpolated in OKLCH so the steps look even. A cue that isn't color (heavier stroke from Overdue on) keeps it readable for colorblind users. Per-item color picking waits for the sprite phase, since color carries decay meaning until then.

**Tile phase.** A skin registry maps each item type to its skin options. Icon and tile skins coexist, so art can ship one item at a time. A few key items (bed, plants, fridge) get custom decay states; everything else uses the generic overlays.

**Sound.** A small set of completion sounds, short and varied, so restores do not get repetitive.

## Completion interaction

Completion happens on the map itself, so the restore always plays in full view. A one-chore item completes on tap; any other item opens a ring of chores around itself. Long-press on anything opens its details and history.

**Gestures**

| Target | Tap | Long-press |
| --- | --- | --- |
| Item with 1 chore | Complete, with Undo toast | Details and history |
| Item with 2 to 5 chores | Ring of chores around the item | Details and history |
| Item with 6+ chores | Bottom sheet (fallback) | Details and history |
| Empty floor | Floor chores ring | Floor details and history |
| Room name label | Room checklist | — |

**Ring**

- Chores fan out around the item on the map, worst first. Each one shows its stage color and a short label.
- Tap a chore: appends a `done` event, and the item restores in place with animation and sound. The ring stays open so more chores can be logged; tap outside to close it.
- Long-press a chore: Skip, Done earlier (backdate), and that chore's history.
- Skip appends a `skip` event and gets a quieter, distinct animation, so skipping never feels like completing.

**Floor as an item**

- Every room has an implicit floor item covering its empty cells, with default floor chores (vacuum, mop).
- Its decay shows as a low-saturation tint over the room, kept subtle so it doesn't overpower item colors.

**Room checklist**

- Tapping a room's name label opens a checklist of that room's due chores, floor included, all pre-checked.
- You uncheck anything you didn't do; one confirm appends a `done` event per checked chore.
- The whole room restores at once.

**Details**

- **Undo:** a toast with Undo for about 5 seconds after any completion or skip, including one-tap and room-checklist completions. Undo appends a `void` event pointing at the original, so the log stays append-only and sync-safe.
- **Done earlier:** backdate a completion from the chore's long-press menu. Forgetting to log right away is common, and Tody reviewers mention a broken "did it on" option.
- **Tap targets:** at least about 44px per item regardless of its drawn size, plus pinch-zoom, so small items near walls aren't fiddly.
- **Open question for Phase 0:** whether one-tap completion feels too easy to be satisfying. If it does, try a short press-and-hold that fills a ring. That would collide with long-press for details, so it would need a clearly different duration or a different details gesture.

**History view**

- Header: item name and room, plus editable notes (model number, filter size, warranty).
- A list of events newest first: date, Done or Skip, the note if any; voided events hidden. Later: who did it, once households exist.
- A filter by chore for items with several.
- Phase 2: rhythm stats ("you do this about every 9 days"), which feed adaptive interval suggestions.

## Roadmap

Phase 0 is a two-to-three-weekend test of the one thing Tody lacked for you: attachment. Nothing after it is built until it passes.

&#91;embedded content: roadmap · 5 phases, 4 gates\]

Durations are rough guesses for side-project pace. Phase 3 is a menu to pick from based on what the Phase 1 dip shows, not a fixed sequence.

**Phase 0 checklist**

- [ ] Scaffold: Vite + TS, service worker, IndexedDB wrapper
- [ ] Domain core: types, event log, decay engine with injected clock, unit tests
- [ ] Grid map: draw rooms as rectangles, place items with footprints
- [ ] Vendor about 10 icons; color-gradient decay with a heavier-stroke cue
- [ ] Restore interaction: animation + sound
- [ ] Onboarding "last done?" seeding with spread offsets
- [ ] JSON export and import
- [ ] Enter your real house and use it daily for 3 weeks; keep notes on when you open it and why

## Risks and open decisions

The biggest risk is the mid-term dip. The catalog fills in early while item histories only get rich months in, so around months two and three the only reward left is tidying.

| Risk | Mitigation | Checked in |
| --- | --- | --- |
| Mid-term dip | Real-world events (weather, recalls, warranties) as a source of novelty; run Phase 1 for 2 to 3 months to observe it | Phase 1 |
| Attachment doesn't form, so this is Tody with art | Phase 0 tests exactly this; stop or pivot if it fails | Phase 0 |
| Rabbit hole on art | Icons first; overlays generic; tiles only in Phase 3 | Ongoing |
| Rabbit hole on the editor | Grid rectangles only; no freeform shapes or SVG import until Phase 3 | Phase 1 |
| Guilt spiral after a gap | Capped decay, no counters, gentle reset | Phase 0 |
| Logging friction | One tap from the map; NFC or QR in Phase 3 | Phase 0 |
| iOS PWA limits | Push only works once installed to the home screen; Web NFC unavailable on iOS (use a Shortcuts URL) | Phase 2 |

**Open decisions:**

- [ ] UI framework: vanilla TS + SVG, or a small one (Preact or Svelte). Leaning vanilla for the map and a tiny framework for the forms
- [ ] Sync backend for Phase 2: self-hosted (homelab) vs. a managed backend
- [ ] Name and brand: under A Minor Studio or standalone
- [ ] Whether to build in public for content from Phase 0, or after the first test
- [ ] Long-interval tasks: which seasons or bundles fit a two-season (wet/dry) climate
- [ ] Decay stage thresholds, after living with Phase 0
