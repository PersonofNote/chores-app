/**
 * The room checklist: every due chore in the room, floor included, pre-checked.
 * Uncheck what you didn't do; one confirm logs the rest.
 */
import type { Id } from '../../domain'
import type { ChoreOption } from '../chores'
import { button, el } from '../components/sheet'
import { choreDot } from './chore-status'

export interface ChecklistEntry {
  option: ChoreOption
  /** What the chore belongs to, e.g. "Bed". */
  itemLabel: string
}

export function roomChecklistBody(entries: readonly ChecklistEntry[], onConfirm: (taskIds: Id[]) => void): HTMLElement {
  const body = el('div', { className: 'sheet-body' })
  if (entries.length === 0) {
    body.append(el('p', { className: 'sheet-note', text: 'Nothing here is due. Everything is in good shape.' }))
    return body
  }

  const boxes: { box: HTMLInputElement; taskId: Id }[] = []
  const list = el('ul', { className: 'checklist' })
  for (const { option, itemLabel } of entries) {
    const box = el('input', { attrs: { type: 'checkbox' } })
    box.checked = true
    boxes.push({ box, taskId: option.task.id })
    list.append(
      el('li', {}, [
        el('label', { className: 'checklist-row' }, [
          box,
          choreDot(option),
          el('span', { className: 'chore-row-text' }, [
            el('span', { className: 'chore-row-name', text: option.task.name }),
            el('span', { className: 'chore-row-status', text: itemLabel }),
          ]),
        ]),
      ]),
    )
  }

  const confirm = button('', () => {
    const ids = boxes.filter((b) => b.box.checked).map((b) => b.taskId)
    if (ids.length) onConfirm(ids)
  }, 'sheet-button primary')
  const update = () => {
    const n = boxes.filter((b) => b.box.checked).length
    confirm.textContent = n === 0 ? 'Nothing checked' : `Log ${n} chore${n === 1 ? '' : 's'}`
    confirm.disabled = n === 0
  }
  list.addEventListener('change', update)
  update()
  body.append(list, confirm)
  return body
}
