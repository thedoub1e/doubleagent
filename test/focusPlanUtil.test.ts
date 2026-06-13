import { describe, expect, test } from 'vitest'
import { describePlan, isPlanDue, normalizeDays, planDayFireKey, type FocusPlan } from '../src/main/focusPlanUtil'

const plan = (over: Partial<FocusPlan> = {}): FocusPlan => ({
  id: 'p1',
  days: [],
  time: '09:00',
  minutes: 25,
  enabled: true,
  ...over
})

// 2026-06-15 是周一(getDay()=1)，09:00。
const monday9 = new Date(2026, 5, 15, 9, 0)
const monday10 = new Date(2026, 5, 15, 10, 0)
const tuesday9 = new Date(2026, 5, 16, 9, 0)

describe('isPlanDue', () => {
  test('每天计划：分钟匹配即触发', () => {
    expect(isPlanDue(plan(), monday9)).toBe(true)
    expect(isPlanDue(plan(), monday10)).toBe(false)
  })
  test('指定星期：仅当天匹配', () => {
    expect(isPlanDue(plan({ days: [1, 3, 5] }), monday9)).toBe(true) // 周一
    expect(isPlanDue(plan({ days: [1, 3, 5] }), tuesday9)).toBe(false) // 周二
  })
  test('禁用 → 不触发', () => {
    expect(isPlanDue(plan({ enabled: false }), monday9)).toBe(false)
  })
})

describe('planDayFireKey', () => {
  test('含计划 id 与当天日期', () => {
    expect(planDayFireKey(plan(), monday9)).toBe('focusplan:p1@2026-6-15')
  })
})

describe('normalizeDays', () => {
  test('去重/排序/过滤非法/7→0', () => {
    expect(normalizeDays([1, 3, 3, 5])).toEqual([1, 3, 5])
    expect(normalizeDays([7, 0, 1])).toEqual([0, 1]) // 7 视作周日
    expect(normalizeDays([9, -1, 'x', 2])).toEqual([2])
    expect(normalizeDays('nope')).toEqual([])
  })
})

describe('describePlan', () => {
  test('每天 / 指定星期 文案', () => {
    expect(describePlan(plan())).toBe('每天 09:00 专注 25 分钟')
    expect(describePlan(plan({ days: [1, 3, 5], time: '20:00', minutes: 60 }))).toBe('周一三五 20:00 专注 60 分钟')
    expect(describePlan(plan({ days: [0, 1, 2, 3, 4, 5, 6] }))).toContain('每天')
  })
})
