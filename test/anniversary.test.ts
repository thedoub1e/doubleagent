import { describe, expect, test } from 'vitest'
import {
  anniversaryLine,
  daysUntil,
  nextRecurringDays,
  type Anniversary
} from '../src/main/anniversary'

const ann = (over: Partial<Anniversary> = {}): Anniversary => ({
  id: 'a1',
  name: '回国',
  date: '2026-07-01',
  recurring: false,
  enabled: true,
  ...over
})

const NOW = new Date(2026, 5, 13) // 2026-06-13

describe('daysUntil (one-time)', () => {
  test('counts whole days, ignoring time of day', () => {
    expect(daysUntil('2026-06-13', new Date(2026, 5, 13, 23, 0))).toBe(0)
    expect(daysUntil('2026-06-14', NOW)).toBe(1)
    expect(daysUntil('2026-07-01', NOW)).toBe(18)
    expect(daysUntil('2026-06-10', NOW)).toBe(-3) // past
    expect(daysUntil('bad', NOW)).toBeNull()
  })
})

describe('nextRecurringDays', () => {
  test('uses this year if upcoming, rolls to next year if passed', () => {
    expect(nextRecurringDays('2020-06-20', NOW)).toBe(7) // 06-20 this year
    expect(nextRecurringDays('2020-06-13', NOW)).toBe(0) // today
    expect(nextRecurringDays('2020-06-10', NOW)).toBe(365 - 3) // passed → next year (2027 not leap on this span)
  })
})

describe('anniversaryLine', () => {
  test('one-time: today / milestone / silent otherwise', () => {
    expect(anniversaryLine(ann({ date: '2026-06-13' }), NOW)).toContain('今天就是')
    expect(anniversaryLine(ann({ date: '2026-06-20' }), NOW)).toContain('还有 7 天')
    expect(anniversaryLine(ann({ date: '2026-06-18' }), NOW)).toBeNull() // 5 days, not a milestone
    expect(anniversaryLine(ann({ date: '2026-06-10' }), NOW)).toBeNull() // past
  })

  test('one-time milestones at 1/3/7/14/30 days', () => {
    expect(anniversaryLine(ann({ date: '2026-07-13' }), NOW)).toContain('30 天')
    expect(anniversaryLine(ann({ date: '2026-06-14' }), NOW)).toContain('1 天')
  })

  test('recurring: celebrates on the day with year count', () => {
    const line = anniversaryLine(ann({ name: '在一起纪念日', date: '2024-06-13', recurring: true }), NOW)
    expect(line).toContain('在一起纪念日')
    expect(line).toContain('第 2 年')
  })

  test('disabled → null', () => {
    expect(anniversaryLine(ann({ date: '2026-06-13', enabled: false }), NOW)).toBeNull()
  })
})
