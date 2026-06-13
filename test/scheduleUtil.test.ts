import { describe, expect, test } from 'vitest'
import {
  dayFireKey,
  dayKey,
  fireKey,
  hhmm,
  isDue,
  isMissed,
  minutesOfDay,
  reminderMinutes
} from '../src/main/scheduleUtil'
import type { Reminder } from '../src/main/config'

const reminder = (over: Partial<Reminder> = {}): Reminder => ({
  id: 'study',
  time: '21:00',
  message: 'x',
  enabled: true,
  ...over
})

describe('scheduleUtil', () => {
  test('hhmm zero-pads hours and minutes', () => {
    expect(hhmm(new Date(2026, 5, 12, 9, 5))).toBe('09:05')
    expect(hhmm(new Date(2026, 5, 12, 21, 0))).toBe('21:00')
  })

  test('dayKey formats Y-M-D', () => {
    expect(dayKey(new Date(2026, 5, 12, 21, 0))).toBe('2026-6-12')
  })

  test('isDue true only when enabled and minute matches', () => {
    const now = new Date(2026, 5, 12, 21, 0)
    expect(isDue(reminder(), now)).toBe(true)
    expect(isDue(reminder({ enabled: false }), now)).toBe(false)
    expect(isDue(reminder({ time: '21:01' }), now)).toBe(false)
  })

  test('fireKey is stable within the same minute and varies by day', () => {
    const a = fireKey(reminder(), new Date(2026, 5, 12, 21, 0, 10))
    const b = fireKey(reminder(), new Date(2026, 5, 12, 21, 0, 50))
    const c = fireKey(reminder(), new Date(2026, 5, 13, 21, 0, 0))
    expect(a).toBe(b)
    expect(a).not.toBe(c)
  })

  test('dayFireKey is stable across the whole day, varies by day', () => {
    expect(dayFireKey(reminder(), new Date(2026, 5, 12, 9, 0))).toBe(
      dayFireKey(reminder(), new Date(2026, 5, 12, 21, 30))
    )
    expect(dayFireKey(reminder(), new Date(2026, 5, 12, 9, 0))).not.toBe(
      dayFireKey(reminder(), new Date(2026, 5, 13, 9, 0))
    )
  })

  test('minutesOfDay / reminderMinutes', () => {
    expect(minutesOfDay(new Date(2026, 5, 13, 9, 5))).toBe(545)
    expect(reminderMinutes(reminder({ time: '21:00' }))).toBe(1260)
    expect(reminderMinutes(reminder({ time: '09:05' }))).toBe(545)
    expect(reminderMinutes(reminder({ time: 'bad' }))).toBe(-1)
    expect(reminderMinutes(reminder({ time: '25:00' }))).toBe(-1)
  })

  test('isMissed: passed today within grace, not at exact minute, respects enabled', () => {
    const r = reminder({ time: '21:00' })
    expect(isMissed(r, new Date(2026, 5, 12, 21, 5), 120)).toBe(true) // 5 min late
    expect(isMissed(r, new Date(2026, 5, 12, 21, 0), 120)).toBe(false) // exact → isDue's job
    expect(isMissed(r, new Date(2026, 5, 12, 20, 59), 120)).toBe(false) // not yet
    expect(isMissed(r, new Date(2026, 5, 12, 23, 30), 120)).toBe(false) // 150 min late > grace
    expect(isMissed(reminder({ time: '21:00', enabled: false }), new Date(2026, 5, 12, 21, 5), 120)).toBe(false)
  })
})
