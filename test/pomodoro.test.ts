import { describe, expect, test } from 'vitest'
import { initialStreak, recordCompletion, streakLine, toView, ymd } from '../src/main/pomodoro'

const at = (y: number, m: number, d: number): Date => new Date(y, m - 1, d, 14, 0)

describe('ymd', () => {
  test('补零的本地日期', () => {
    expect(ymd(at(2026, 6, 3))).toBe('2026-06-03')
    expect(ymd(at(2026, 12, 25))).toBe('2026-12-25')
  })
})

describe('recordCompletion', () => {
  test('首次完成 → daily 记 1, streak 1', () => {
    const s = recordCompletion(initialStreak(), at(2026, 6, 13))
    expect(s.daily['2026-06-13']).toBe(1)
    expect(s.currentStreak).toBe(1)
    expect(s.bestStreak).toBe(1)
  })

  test('同一天再完成 → 当天 +1，连续天数不变', () => {
    let s = recordCompletion(initialStreak(), at(2026, 6, 13))
    s = recordCompletion(s, at(2026, 6, 13))
    expect(s.daily['2026-06-13']).toBe(2)
    expect(s.currentStreak).toBe(1)
  })

  test('连续两天 → streak 递增', () => {
    let s = recordCompletion(initialStreak(), at(2026, 6, 13))
    s = recordCompletion(s, at(2026, 6, 14))
    expect(s.currentStreak).toBe(2)
    expect(s.bestStreak).toBe(2)
  })

  test('断签（隔 ≥2 天）→ streak 重置为 1，best 保留', () => {
    let s = recordCompletion(initialStreak(), at(2026, 6, 13))
    s = recordCompletion(s, at(2026, 6, 14)) // streak 2
    s = recordCompletion(s, at(2026, 6, 17)) // 隔了 6/15、6/16
    expect(s.currentStreak).toBe(1)
    expect(s.bestStreak).toBe(2)
  })

  test('跨月连续（5/31 → 6/1）', () => {
    let s = recordCompletion(initialStreak(), at(2026, 5, 31))
    s = recordCompletion(s, at(2026, 6, 1))
    expect(s.currentStreak).toBe(2)
  })
})

describe('toView — 跨天实时刷新', () => {
  test('新的一天没完成 → 今日数归 0，本周仍含昨天，连续天数仍有效', () => {
    const s = recordCompletion(recordCompletion(initialStreak(), at(2026, 6, 13)), at(2026, 6, 13)) // 6/13 完成 2 次
    const v = toView(s, at(2026, 6, 14)) // 第二天看
    expect(v.todayCount).toBe(0) // 不再显示昨天的 2
    expect(v.weekCount).toBe(2) // 近 7 天含昨天的 2
    expect(v.currentStreak).toBe(1) // 昨天完成过 → streak 仍有效
  })

  test('断签后看（隔了 2 天没碰）→ 连续天数归 0', () => {
    const s = recordCompletion(initialStreak(), at(2026, 6, 13))
    const v = toView(s, at(2026, 6, 16)) // 隔了 6/14、6/15
    expect(v.currentStreak).toBe(0)
    expect(v.todayCount).toBe(0)
  })

  test('本周统计累加多天', () => {
    let s = recordCompletion(initialStreak(), at(2026, 6, 12))
    s = recordCompletion(s, at(2026, 6, 13))
    s = recordCompletion(s, at(2026, 6, 14))
    const v = toView(s, at(2026, 6, 14))
    expect(v.weekCount).toBe(3)
    expect(v.todayCount).toBe(1)
    expect(v.currentStreak).toBe(3)
  })
})

describe('streakLine', () => {
  test('单日不提连续；多日提连续 + 新纪录', () => {
    expect(streakLine({ currentStreak: 1, bestStreak: 1, todayCount: 1, weekCount: 1 })).not.toContain('连续')
    const multi = streakLine({ currentStreak: 5, bestStreak: 5, todayCount: 1, weekCount: 8 })
    expect(multi).toContain('连续专注 5 天')
    expect(multi).toContain('新纪录')
  })
})
