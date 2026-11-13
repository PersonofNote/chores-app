/** All of an item's chores as a list: the fallback for items with too many for a ring. */
import type { Id } from '../../domain'
import type { ChoreOption } from '../chores'
import { pressable } from '../components/pressable'
import { el } from '../components/sheet'
import { choreDot, choreStatusText } from './chore-status'

export interface ChoreListHandlers {
  onPick: (taskId: Id) => void
  onMenu: (taskId: Id) => void
}

export interface ChoreList {
  body: HTMLElement
  /** Re-renders statuses in place (after logging), keeping the order. */
  refresh: (options: readonly ChoreOption[], now: Date) => void
}

export function choreList(options: readonly ChoreOption[], now: Date, h: ChoreListHandlers): ChoreList {
  const list = el('ul', { className: 'chore-list' })
  const rows = new Map<Id, HTMLButtonElement>()
  for (const o of options) {
    const row = el('button', { className: 'chore-row', attrs: { type: 'button' } })
    pressable(row, { onTap: () => h.onPick(o.task.id), onLongPress: () => h.onMenu(o.task.id) })
    rows.set(o.task.id, row)
    list.append(el('li', {}, [row]))
  }
  const refresh = (opts: readonly ChoreOption[], at: Date) => {
    for (const o of opts) {
      const row = rows.get(o.task.id)
      if (!row) continue
      row.dataset.stage = o.stage
      row.replaceChildren(
        choreDot(o),
        el('span', { className: 'chore-row-text' }, [
          el('span', { className: 'chore-row-name', text: o.task.name }),
          el('span', { className: 'chore-row-status', text: choreStatusText(o, at) }),
        ]),
      )
    }
  }
  refresh(options, now)
  return { body: el('div', { className: 'sheet-body' }, [list]), refresh }
}
