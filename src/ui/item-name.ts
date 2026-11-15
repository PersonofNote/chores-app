/**
 * Naming an item ("Armoire", "Left nightstand"). Shared by the editor's item toolbar
 * and the item's details sheet. An empty name goes back to the type's label.
 */
import { itemTypeLabel, MAX_ITEM_NAME, type Id, type Item } from '../domain'
import type { HouseStore } from '../state/house-store'
import { button, el, type SheetHost } from './components/sheet'

export function itemNameBody(item: Pick<Item, 'type' | 'name'>, onSave: (name: string) => void): HTMLElement {
  const typeLabel = itemTypeLabel(item.type)
  const input = el('input', {
    className: 'text-input',
    attrs: { type: 'text', 'aria-label': 'Item name', maxlength: String(MAX_ITEM_NAME), placeholder: typeLabel },
  })
  input.value = item.name ?? ''
  const save = button('Save', () => onSave(input.value), 'sheet-button primary')
  input.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') save.click()
  })
  return el('div', { className: 'sheet-body' }, [
    input,
    el('p', { className: 'sheet-note', text: `Leave it empty to call it “${typeLabel}”.` }),
    save,
  ])
}

/** Opens the rename sheet; `after` runs once the name is saved (or with the error). */
export function openItemRename(
  deps: { store: HouseStore; sheets: SheetHost },
  itemId: Id,
  after: { saved: (item: Item) => void; failed: (err: unknown) => void },
): void {
  const item = deps.store.item(itemId)
  if (!item) return
  deps.sheets.open({
    title: 'Rename',
    subtitle: itemTypeLabel(item.type),
    body: itemNameBody(item, (name) => {
      deps.store.renameItem(itemId, name).then(after.saved, after.failed)
    }),
  })
}
