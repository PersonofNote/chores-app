import { describe, expect, it } from 'vitest'
import { choreNameKey, choreSuggestions, createDefaultTasks, defaultLibrary, itemName, LibraryError, parseLibrary } from './library'
import { sequentialIds } from './time'
import { ValidationError } from './validate'

describe('default library', () => {
  it('loads and covers both cleaning and long-interval maintenance', () => {
    expect(defaultLibrary.items.bed?.tasks[0]).toEqual({ name: 'Wash sheets', intervalDays: 7 })
    expect(defaultLibrary.items['hvac-filter']?.tasks[0]?.intervalDays).toBe(90)
    expect(defaultLibrary.items['water-heater']?.tasks[0]?.intervalDays).toBe(365)
  })

  it('includes the implicit floor type', () => {
    expect(defaultLibrary.items.floor).toBeDefined()
  })
})

describe('parseLibrary', () => {
  const valid = {
    version: 1,
    items: { lamp: { label: 'Lamp', size: { w: 1, h: 1 }, tasks: [{ name: 'Dust', intervalDays: 14 }] } },
  }

  it('accepts a valid library', () => {
    expect(parseLibrary(valid).items.lamp?.label).toBe('Lamp')
  })

  it.each([
    [{ ...valid, version: 0 }, 'library.version'],
    [{ version: 1, items: { lamp: { ...valid.items.lamp, size: { w: 0, h: 1 } } } }, 'library.items.lamp.size'],
    [{ version: 1, items: { lamp: { ...valid.items.lamp, tasks: [] } } }, 'library.items.lamp.tasks'],
    [
      { version: 1, items: { lamp: { ...valid.items.lamp, tasks: [{ name: 'Dust', intervalDays: -3 }] } } },
      'library.items.lamp.tasks[0].intervalDays',
    ],
  ])('reports the bad path (%#)', (json, path) => {
    expect(() => parseLibrary(json)).toThrow(ValidationError)
    expect(() => parseLibrary(json)).toThrow(path)
  })
})

describe('createDefaultTasks', () => {
  it('creates interval tasks from the item type', () => {
    const tasks = createDefaultTasks('item-9', 'bed', sequentialIds('task'))
    expect(tasks).toEqual([
      { id: 'task-1', itemId: 'item-9', name: 'Wash sheets', intervalDays: 7, kind: 'interval' },
      { id: 'task-2', itemId: 'item-9', name: 'Rotate mattress', intervalDays: 90, kind: 'interval' },
    ])
  })

  it('throws on an unknown type', () => {
    expect(() => createDefaultTasks('i', 'spaceship', sequentialIds())).toThrow(LibraryError)
  })
})

describe('choreSuggestions', () => {
  it('offers the defaults first, then the extras', () => {
    const names = choreSuggestions('counter').map((t) => t.name)
    expect(names.slice(0, 2)).toEqual(['Wipe counter', 'Clear clutter'])
    expect(names).toContain('Wash rags')
  })

  it('drops repeated names, ignoring case and spacing', () => {
    const library = parseLibrary({
      version: 1,
      items: {
        x: {
          label: 'X',
          size: { w: 1, h: 1 },
          tasks: [{ name: 'Dust', intervalDays: 7 }],
          suggestions: [{ name: ' dust ', intervalDays: 14 }, { name: 'Polish', intervalDays: 30 }],
        },
      },
    })
    expect(choreSuggestions('x', library)).toEqual([
      { name: 'Dust', intervalDays: 7 },
      { name: 'Polish', intervalDays: 30 },
    ])
  })

  it('has nothing for an unknown type', () => {
    expect(choreSuggestions('spaceship')).toEqual([])
  })
})

describe('choreNameKey', () => {
  it('ignores case and extra spaces', () => {
    expect(choreNameKey('  Wash   Rags ')).toBe(choreNameKey('wash rags'))
  })
})

describe('itemName', () => {
  it('is what you called it, else the type label', () => {
    expect(itemName({ type: 'dresser', name: 'Armoire' })).toBe('Armoire')
    expect(itemName({ type: 'dresser' })).toBe('Dresser')
    expect(itemName({ type: 'dresser', name: '  ' })).toBe('Dresser')
  })
})
