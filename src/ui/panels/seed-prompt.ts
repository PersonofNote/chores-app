/**
 * Onboarding's "Last done?" for each chore of something just added. Every chore
 * starts on "No idea", which spreads due dates so a new house doesn't all come due
 * at once; change the ones you remember.
 */
import { LAST_DONE_ANSWERS, type Id, type LastDoneAnswer, type Task } from '../../domain'
import { button, el } from '../components/sheet'
import { intervalLabel } from '../format'

const ANSWER_LABEL: Record<LastDoneAnswer, string> = {
  'this-week': 'This week',
  'this-month': 'This month',
  'no-idea': 'No idea',
}

export interface SeedPrompt {
  body: HTMLElement
  /** The current answers; read when the sheet closes, however it closes. */
  answers: () => Map<Id, LastDoneAnswer>
}

export function seedPrompt(tasks: readonly Task[], onDone: () => void): SeedPrompt {
  const answers = new Map<Id, LastDoneAnswer>(tasks.map((t) => [t.id, 'no-idea']))
  const rows = tasks.map((task) => {
    const group = lastDoneChoice(`seed-${task.id}`, `${task.name}: last done`, (answer) => answers.set(task.id, answer))
    return el('li', { className: 'seed-row' }, [
      el('span', { className: 'chore-row-text' }, [
        el('span', { className: 'chore-row-name', text: task.name }),
        el('span', { className: 'chore-row-status', text: intervalLabel(task.intervalDays) }),
      ]),
      group,
    ])
  })
  const body = el('div', { className: 'sheet-body' }, [
    el('p', { className: 'sheet-note', text: 'When was each last done? Guesses are fine.' }),
    el('ul', { className: 'seed-list' }, rows),
    button('Save', onDone, 'sheet-button primary'),
  ])
  return { body, answers: () => new Map(answers) }
}

/** This week / This month / No idea, starting on "No idea". `key` must be unique on the page. */
export function lastDoneChoice(key: string, label: string, onChange: (answer: LastDoneAnswer) => void): HTMLElement {
  const group = el('div', { className: 'segmented', attrs: { role: 'radiogroup', 'aria-label': label } })
  for (const answer of LAST_DONE_ANSWERS) {
    const id = `${key}-${answer}`
    const input = el('input', { attrs: { type: 'radio', name: key, id, value: answer } })
    input.checked = answer === 'no-idea'
    input.addEventListener('change', () => onChange(answer))
    group.append(input, el('label', { text: ANSWER_LABEL[answer], attrs: { for: id } }))
  }
  return group
}
