import { describe, expect, test } from 'vitest'
import {
  buildTodayEventsScript,
  eventLeadMinutes,
  isUpcoming,
  parseEventLines
} from '../src/main/calendar'

describe('buildTodayEventsScript', () => {
  test('is read-only: reads today Calendar events, never mutates', () => {
    const s = buildTodayEventsScript()
    expect(s).toContain('Calendar')
    expect(s).toContain('start date')
    expect(s).not.toContain('make new')
    expect(s).not.toContain('delete')
  })
})

describe('parseEventLines', () => {
  test('parses "summary\\tH:M" into title + zero-padded HH:MM', () => {
    expect(parseEventLines('Lecture\t9:5\nLab\t14:0\n')).toEqual([
      { title: 'Lecture', time: '09:05' },
      { title: 'Lab', time: '14:00' }
    ])
  })

  test('trims, drops empty lines and empty titles', () => {
    expect(parseEventLines('  Seminar\t10:30  \n\n\t11:0\n')).toEqual([
      { title: 'Seminar', time: '10:30' }
    ])
  })

  test('line without a time becomes title with empty time', () => {
    expect(parseEventLines('All-day workshop\n')).toEqual([
      { title: 'All-day workshop', time: '' }
    ])
  })

  test('empty output → empty array', () => {
    expect(parseEventLines('')).toEqual([])
  })
})

describe('eventLeadMinutes / isUpcoming', () => {
  test('eventLeadMinutes = event minutes - now minutes', () => {
    const now = new Date(2026, 5, 13, 9, 0)
    expect(eventLeadMinutes('09:30', now)).toBe(30)
    expect(eventLeadMinutes('09:00', now)).toBe(0)
    expect(eventLeadMinutes('08:30', now)).toBe(-30)
    expect(eventLeadMinutes('', now)).toBeNull()
    expect(eventLeadMinutes('25:00', now)).toBeNull()
  })

  test('isUpcoming: within 1..withinMin minutes, excludes started/exact-now', () => {
    const now = new Date(2026, 5, 13, 9, 0)
    expect(isUpcoming('09:30', now, 30)).toBe(true)
    expect(isUpcoming('09:25', now, 30)).toBe(true)
    expect(isUpcoming('09:31', now, 30)).toBe(false) // beyond window
    expect(isUpcoming('09:00', now, 30)).toBe(false) // starting now
    expect(isUpcoming('08:45', now, 30)).toBe(false) // already started
  })
})
