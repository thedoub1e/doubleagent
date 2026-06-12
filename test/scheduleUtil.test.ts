import { describe, expect, test } from 'vitest'
import { dayKey, fireKey, hhmm, isDue } from '../src/main/scheduleUtil'
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
})
