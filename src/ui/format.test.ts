import { describe, expect, it } from 'vitest'
import { calendarDaysAgo, dateFromInput, intervalLabel, relativeDay, toDateInputValue } from './format'

const now = new Date(2026, 10, 13, 9, 30) // Nov 13, 09:30 local

describe('relativeDay', () => {
  it.each([
    [new Date(2026, 10, 13, 1), 'today'],
    [new Date(2026, 10, 12, 23), 'yesterday'],
    [new Date(2026, 10, 8), '5 days ago'],
    [new Date(2026, 9, 23), '3 weeks ago'],
    [new Date(2026, 4, 13), '6 months ago'],
    [new Date(2023, 10, 13), '3 years ago'],
  ])('%s → %s', (date, label) => expect(relativeDay(date, now)).toBe(label))

  it('counts calendar days, not 24h spans', () => {
    expect(calendarDaysAgo(new Date(2026, 10, 12, 23, 59), new Date(2026, 10, 13, 0, 1))).toBe(1)
  })
})

it('intervalLabel names common intervals', () => {
  expect(intervalLabel(7)).toBe('every week')
  expect(intervalLabel(90)).toBe('every 3 months')
  expect(intervalLabel(10)).toBe('every 10 days')
})

describe('dateFromInput', () => {
  it('is midday on a past day', () => {
    expect(dateFromInput('2026-11-10', now)).toEqual(new Date(2026, 10, 10, 12))
  })
  it('is now for today when midday is still ahead', () => {
    expect(dateFromInput(toDateInputValue(now), now)).toBe(now)
  })
  it('rejects future and malformed dates', () => {
    expect(dateFromInput('2026-11-14', now)).toBeNull()
    expect(dateFromInput('yesterday', now)).toBeNull()
  })
})
