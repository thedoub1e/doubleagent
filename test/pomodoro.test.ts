import { describe, expect, test } from 'vitest'
import { initialStreak, recordCompletion, streakLine, ymd } from '../src/main/pomodoro'

const at = (y: number, m: number, d: number): Date => new Date(y, m - 1, d, 14, 0)

describe('ymd', () => {
  test('补零的本地日期', () => {
    expect(ymd(at(2026, 6, 3))).toBe('2026-06-03')
    expect(ymd(at(2026, 12, 25))).toBe('2026-12-25')
  })
})

describe('recordCompletion', () => {
  test('首次完成 → streak=1, todayCount=1, best=1', () => {
    const s = recordCompletion(initialStreak(), at(2026, 6, 13))
    expect(s).toEqual({ lastDate: '2026-06-13', currentStreak: 1, bestStreak: 1, todayCount: 1 })
  })

  test('同一天再完成 → todayCount 累加，连续天数不变', () => {
    let s = recordCompletion(initialStreak(), at(2026, 6, 13))
    s = recordCompletion(s, at(2026, 6, 13))
    expect(s.todayCount).toBe(2)
    expect(s.currentStreak).toBe(1)
  })

  test('连续两天 → streak 递增，todayCount 归 1', () => {
    let s = recordCompletion(initialStreak(), at(2026, 6, 13))
    s = recordCompletion(s, at(2026, 6, 14))
    expect(s.currentStreak).toBe(2)
    expect(s.todayCount).toBe(1)
    expect(s.bestStreak).toBe(2)
  })

  test('断签（隔 ≥2 天）→ streak 重置为 1，best 保留', () => {
    let s = recordCompletion(initialStreak(), at(2026, 6, 13))
    s = recordCompletion(s, at(2026, 6, 14)) // streak 2, best 2
    s = recordCompletion(s, at(2026, 6, 17)) // 隔了 6/15、6/16
    expect(s.currentStreak).toBe(1)
    expect(s.bestStreak).toBe(2) // 历史最佳不丢
  })

  test('跨月连续也正确（5/31 → 6/1）', () => {
    let s = recordCompletion(initialStreak(), at(2026, 5, 31))
    s = recordCompletion(s, at(2026, 6, 1))
    expect(s.currentStreak).toBe(2)
  })
})

describe('streakLine', () => {
  test('单日不提连续；多日提连续天数', () => {
    expect(streakLine({ lastDate: 'x', currentStreak: 1, bestStreak: 1, todayCount: 1 })).not.toContain('连续')
    const multi = streakLine({ lastDate: 'x', currentStreak: 5, bestStreak: 5, todayCount: 1 })
    expect(multi).toContain('连续专注 5 天')
    expect(multi).toContain('新纪录')
  })
  test('连续但非新纪录时不标记新纪录', () => {
    const line = streakLine({ lastDate: 'x', currentStreak: 3, bestStreak: 9, todayCount: 2 })
    expect(line).toContain('连续专注 3 天')
    expect(line).not.toContain('新纪录')
  })
})
