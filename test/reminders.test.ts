import { describe, expect, test } from 'vitest'
import {
  buildCompleteReminderScript,
  buildCreateReminderScript,
  buildListNamesScript,
  buildListRemindersScript,
  escapeAppleScript,
  formatDueHuman,
  parseIsoDate,
  parseReminderTitles
} from '../src/main/reminders'

describe('escapeAppleScript', () => {
  test('escapes backslash then double-quote', () => {
    expect(escapeAppleScript('a"b')).toBe('a\\"b')
    expect(escapeAppleScript('a\\b')).toBe('a\\\\b')
    expect(escapeAppleScript('交"essay"')).toBe('交\\"essay\\"')
  })

  test('leaves plain text untouched', () => {
    expect(escapeAppleScript('下周二交作业')).toBe('下周二交作业')
  })
})

describe('parseIsoDate', () => {
  test('date-only → local midnight, hasTime false', () => {
    const r = parseIsoDate('2026-06-17')
    expect(r).not.toBeNull()
    expect(r!.hasTime).toBe(false)
    expect(r!.date.getFullYear()).toBe(2026)
    expect(r!.date.getMonth()).toBe(5) // June (0-based)
    expect(r!.date.getDate()).toBe(17)
    expect(r!.date.getHours()).toBe(0)
  })

  test('datetime → local time, hasTime true (T and space both ok)', () => {
    const a = parseIsoDate('2026-06-17T09:30')
    expect(a!.hasTime).toBe(true)
    expect(a!.date.getHours()).toBe(9)
    expect(a!.date.getMinutes()).toBe(30)
    const b = parseIsoDate('2026-06-17 21:05:00')
    expect(b!.date.getHours()).toBe(21)
    expect(b!.date.getMinutes()).toBe(5)
  })

  test('rejects invalid / out-of-range / garbage', () => {
    expect(parseIsoDate('2026-13-01')).toBeNull()
    expect(parseIsoDate('2026-06-31')).toBeNull() // June has 30 days
    expect(parseIsoDate('2026-06-17T25:00')).toBeNull()
    expect(parseIsoDate('明天')).toBeNull()
    expect(parseIsoDate('')).toBeNull()
  })
})

describe('formatDueHuman', () => {
  test('formats Chinese M月D日(周X) HH:MM', () => {
    // 2026-06-17 is a Wednesday
    expect(formatDueHuman(new Date(2026, 5, 17, 9, 5))).toBe('6月17日(周三) 09:05')
    expect(formatDueHuman(new Date(2026, 5, 17, 21, 0))).toBe('6月17日(周三) 21:00')
  })
})

describe('buildCreateReminderScript', () => {
  test('with date + list: escaped title, target list, date fragment, remind me date', () => {
    const s = buildCreateReminderScript({
      title: '交"essay"',
      date: new Date(2026, 5, 17, 9, 0),
      list: '小狗测试_可删'
    })
    expect(s).toContain('交\\"essay\\"')
    expect(s).toContain('tell list "小狗测试_可删"')
    expect(s).toContain('make new reminder')
    expect(s).toContain('set year of theDate to 2026')
    expect(s).toContain('set month of theDate to 6')
    expect(s).toContain('set day of theDate to 17')
    expect(s).toContain('set hours of theDate to 9')
    expect(s).toContain('remind me date:theDate')
    expect(s).toContain('due date:theDate')
  })

  test('without date: no date fragment, no remind me date', () => {
    const s = buildCreateReminderScript({ title: '买牛奶' })
    expect(s).toContain('买牛奶')
    expect(s).not.toContain('remind me date')
    expect(s).not.toContain('set year of theDate')
  })

  test('without list: targets default Reminders app, not a named list', () => {
    const s = buildCreateReminderScript({ title: '买牛奶' })
    expect(s).toContain('tell application "Reminders"')
    expect(s).not.toContain('tell list')
  })

  test('escapes quotes in title/list so they cannot break out of the string literal', () => {
    const s = buildCreateReminderScript({ title: 'a"b', list: 'x"y' })
    // every user-supplied double-quote appears backslash-escaped inside the literal
    expect(s).toContain('name:"a\\"b"')
    expect(s).toContain('tell list "x\\"y"')
  })

  test('ensureList: creates the list if missing before writing', () => {
    const s = buildCreateReminderScript({ title: '买牛奶', list: '小狗测试_可删', ensureList: true })
    expect(s).toContain('if not (exists list "小狗测试_可删") then make new list with properties {name:"小狗测试_可删"}')
    expect(s).toContain('tell list "小狗测试_可删"')
  })

  test('ensureList without a list name is a no-op (no exists check)', () => {
    const s = buildCreateReminderScript({ title: '买牛奶', ensureList: true })
    expect(s).not.toContain('exists list')
  })
})

describe('buildListNamesScript', () => {
  test('is read-only: reads list names, never creates', () => {
    const s = buildListNamesScript()
    expect(s).toContain('Reminders')
    expect(s).toMatch(/name of (every list|lists)/)
    expect(s).not.toContain('make new')
  })
})

describe('buildListRemindersScript', () => {
  test('with list: read-only, only incomplete, reads names', () => {
    const s = buildListRemindersScript('小狗测试_可删')
    expect(s).toContain('tell list "小狗测试_可删"')
    expect(s).toContain('completed is false')
    expect(s).toContain('name of')
    expect(s).not.toContain('make new')
    expect(s).not.toContain('set completed')
  })

  test('without list: reads from the Reminders app, not a named list', () => {
    const s = buildListRemindersScript()
    expect(s).toContain('tell application "Reminders"')
    expect(s).not.toContain('tell list')
  })

  test('escapes list name', () => {
    expect(buildListRemindersScript('x"y')).toContain('tell list "x\\"y"')
  })
})

describe('parseReminderTitles', () => {
  test('splits lines, trims, drops empties', () => {
    expect(parseReminderTitles('交essay\n买牛奶\n\n  写周报  \n')).toEqual([
      '交essay',
      '买牛奶',
      '写周报'
    ])
  })

  test('empty output → empty array', () => {
    expect(parseReminderTitles('')).toEqual([])
    expect(parseReminderTitles('   \n  ')).toEqual([])
  })
})

describe('buildCompleteReminderScript', () => {
  test('marks the first matching incomplete reminder complete; escapes title', () => {
    const s = buildCompleteReminderScript('交"essay"', '小狗测试_可删')
    expect(s).toContain('tell list "小狗测试_可删"')
    expect(s).toContain('交\\"essay\\"')
    expect(s).toContain('set completed of')
    expect(s).toContain('completed is false')
  })

  test('without list targets the Reminders app directly', () => {
    const s = buildCompleteReminderScript('买牛奶')
    expect(s).toContain('tell application "Reminders"')
    expect(s).not.toContain('tell list')
  })
})
