/**
 * Editing one item's chores: list → add / edit → back to the list. Opens from the
 * item's details sheet and from the editor's item toolbar.
 *
 * The forms check the chore rules (domain/tasks.ts) as you save, so mistakes show
 * inline; `HouseStore` checks them again before writing.
 */
import {
  checkChore,
  choreNameKey,
  choreSuggestions,
  describeChoreProblem,
  seedTasks,
  tidyChoreName,
  type Clock,
  type Id,
  type IdGenerator,
  type Random,
  type Task,
} from '../domain'
import type { DecayPalette } from '../render/decay-style'
import { ChoreError, type HouseStore } from '../state/house-store'
import { choreOptions, itemLabel } from './chores'
import type { SheetHost } from './components/sheet'
import type { Toaster } from './components/toast'
import { choreFormBody, choresListBody, type ChoreDraft } from './panels/chore-form'
import { confirmBody } from './panels/editor-panels'

export interface ChoreEditorDeps {
  store: HouseStore
  sheets: SheetHost
  toaster: Toaster
  palette: () => DecayPalette
  clock: Clock
  newId: IdGenerator
  random?: Random
}

/** Where a new chore's "How often" starts. */
const NEW_CHORE_INTERVAL = 7

export class ChoreEditor {
  private readonly random: Random

  constructor(private readonly deps: ChoreEditorDeps) {
    this.random = deps.random ?? Math.random
  }

  /** The item's chores, in the order they were added. */
  open(itemId: Id): void {
    const { store, sheets } = this.deps
    const item = store.item(itemId)
    if (!item) return
    const tasks = store.tasksForItem(itemId)
    const order = new Map(tasks.map((t, i) => [t.id, i]))
    const options = choreOptions(tasks, store.status(), this.deps.palette(), store.config).sort(
      (a, b) => order.get(a.task.id)! - order.get(b.task.id)!,
    )
    sheets.open({
      title: this.label(itemId),
      subtitle: 'Chores',
      body: choresListBody(options, { onEdit: (taskId) => this.edit(taskId), onAdd: () => this.add(itemId) }),
    })
  }

  add(itemId: Id): void {
    const { store, sheets, toaster, clock, newId } = this.deps
    const item = store.item(itemId)
    if (!item) return
    const taken = new Set(store.tasksForItem(itemId).map((t) => choreNameKey(t.name)))
    const id = newId()
    sheets.open({
      title: 'Add chore',
      subtitle: this.label(itemId),
      body: choreFormBody({
        initial: { name: '', intervalDays: NEW_CHORE_INTERVAL },
        saveLabel: 'Add',
        suggestions: choreSuggestions(item.type).filter((s) => !taken.has(choreNameKey(s.name))),
        askLastDone: true,
        check: (d) => this.problem({ id, itemId, ...d }),
        onSave: (d) => {
          const task = this.taskFrom({ id, itemId, kind: 'interval' }, d)
          const seed = seedTasks([task], new Map([[id, d.lastDone ?? 'no-idea']]), { clock, newId, random: this.random })
          store.addTask(task, seed).then(
            (added) => {
              this.open(itemId)
              toaster.show(`Added ${added.name}`)
            },
            (err) => this.failed(err),
          )
        },
        onCancel: () => this.open(itemId),
      }),
    })
  }

  edit(taskId: Id): void {
    const { store, sheets } = this.deps
    const task = store.task(taskId)
    if (!task) return
    sheets.open({
      title: task.name,
      subtitle: this.label(task.itemId),
      body: choreFormBody({
        initial: task,
        saveLabel: 'Save',
        check: (d) => this.problem({ ...task, ...d }),
        onSave: (d) => {
          store.updateTask(this.taskFrom(task, d)).then(
            () => this.open(task.itemId),
            (err) => this.failed(err),
          )
        },
        onCancel: () => this.open(task.itemId),
        onRemove: () => this.confirmRemove(task),
      }),
    })
  }

  private confirmRemove(task: Task): void {
    const { store, sheets, toaster } = this.deps
    sheets.open({
      title: 'Remove chore?',
      body: confirmBody(
        `Remove “${task.name}” from ${this.label(task.itemId)}? Its history stays in backups.`,
        'Remove',
        () => {
          store.deleteTask(task.id).then(
            () => {
              this.open(task.itemId)
              toaster.show(`Removed ${task.name}`)
            },
            (err) => this.failed(err),
          )
        },
        () => this.edit(task.id),
      ),
    })
  }

  private taskFrom(base: Pick<Task, 'id' | 'itemId' | 'kind'> & Partial<Task>, d: ChoreDraft): Task {
    const { lastDone: _, ...fields } = d
    return { ...base, ...fields, name: tidyChoreName(fields.name) }
  }

  private problem(chore: Pick<Task, 'id' | 'itemId' | 'name' | 'intervalDays'>): string | null {
    const p = checkChore(chore, this.deps.store.tasksForItem(chore.itemId))
    return p ? describeChoreProblem(p) : null
  }

  private label(itemId: Id): string {
    const item = this.deps.store.item(itemId)
    return item ? itemLabel(item, this.deps.store.house.rooms) : ''
  }

  private failed(err: unknown): void {
    if (err instanceof ChoreError) return this.deps.toaster.show(err.message)
    console.error(err)
    this.deps.toaster.show("Couldn't save that. Try again.")
  }
}
