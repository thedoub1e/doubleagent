import { describe, expect, test } from 'vitest'
import { cancelDailyReminders, normalizeTime, upsertDailyReminder } from '../src/main/reminderRules'
import type { Reminder } from '../src/main/config'

const base: Reminder[] = [
  { id: 'study', time: '21:00', message: '今天学习了吗？', enabled: true },
  { id: 'sleep', time: '23:30', message: '早点睡哦', enabled: true }
]

describe('normalizeTime', () => {
  test('补零 / 非法返回 null', () => {
    expect(normalizeTime('9:5')).toBe('09:05')
    expect(normalizeTime('21:00')).toBe('21:00')
    expect(normalizeTime('25:00')).toBeNull()
    expect(normalizeTime('abc')).toBeNull()
  })
})

describe('upsertDailyReminder', () => {
  test('新时段 → 新增一条，updated=false', () => {
    const r = upsertDailyReminder(base, '9:00', '背单词')
    expect(r).not.toBeNull()
    expect(r!.updated).toBe(false)
    expect(r!.reminders).toHaveLength(3)
    const added = r!.reminders.find((x) => x.time === '09:00')
    expect(added).toMatchObject({ time: '09:00', message: '背单词', enabled: true })
  })

  test('已有时段 → 改文案并启用，不新增', () => {
    const off = [{ id: 'sleep', time: '23:30', message: '老文案', enabled: false }]
    const r = upsertDailyReminder(off, '23:30', '该睡啦')
    expect(r!.updated).toBe(true)
    expect(r!.reminders).toHaveLength(1)
    expect(r!.reminders[0]).toMatchObject({ message: '该睡啦', enabled: true })
  })

  test('非法时间 → null', () => {
    expect(upsertDailyReminder(base, '今晚', 'x')).toBeNull()
  })

  test('不可变：不改原数组', () => {
    const copy = [...base]
    upsertDailyReminder(base, '9:00', 'x')
    expect(base).toEqual(copy)
  })
})

describe('cancelDailyReminders', () => {
  test('按时段删', () => {
    const r = cancelDailyReminders(base, { time: '23:30' })
    expect(r.removed).toBe(1)
    expect(r.reminders.find((x) => x.time === '23:30')).toBeUndefined()
  })
  test('按关键词删', () => {
    const r = cancelDailyReminders(base, { keyword: '学习' })
    expect(r.removed).toBe(1)
    expect(r.reminders.find((x) => x.id === 'study')).toBeUndefined()
  })
  test('都不匹配 → removed=0', () => {
    expect(cancelDailyReminders(base, { time: '07:00' }).removed).toBe(0)
    expect(cancelDailyReminders(base, { keyword: '喝水' }).removed).toBe(0)
  })
})
