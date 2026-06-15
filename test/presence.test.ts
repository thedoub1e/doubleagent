import { describe, expect, test } from 'vitest'
import {
  BREAK_IDLE_SEC,
  evaluatePresence,
  GREET_COOLDOWN_MS,
  initialPresence,
  pickGreeting,
  RETURN_IDLE_SEC,
  SEDENTARY_MINUTES,
  shouldGreet
} from '../src/main/presence'

const MIN = 60_000
const T0 = 1_000_000_000_000 // 任意基准时间戳

describe('evaluatePresence — 久坐感知', () => {
  test('连续活跃达到阈值 → sedentary，且每段只提醒一次', () => {
    let s = initialPresence()
    // 起始活跃（idle 很小）
    let r = evaluatePresence(s, 5, T0)
    expect(r.action).toBeNull()
    s = r.state

    // 刚到阈值前一刻：不提醒
    r = evaluatePresence(s, 5, T0 + (SEDENTARY_MINUTES - 1) * MIN)
    expect(r.action).toBeNull()
    s = r.state

    // 越过阈值：提醒一次
    r = evaluatePresence(s, 5, T0 + SEDENTARY_MINUTES * MIN)
    expect(r.action).toBe('sedentary')
    s = r.state

    // 仍连续活跃：不再重复提醒
    r = evaluatePresence(s, 5, T0 + (SEDENTARY_MINUTES + 10) * MIN)
    expect(r.action).toBeNull()
  })

  test('休息（空闲 ≥ BREAK）重置活跃段，回来后重新计时', () => {
    let s = initialPresence()
    s = evaluatePresence(s, 5, T0).state
    // 进入休息
    let r = evaluatePresence(s, BREAK_IDLE_SEC, T0 + 10 * MIN)
    expect(r.action).toBeNull()
    expect(r.state.idle).toBe(true)
    s = r.state

    // 短暂休息后回来（峰值 < RETURN）：不打招呼，但活跃段重新从现在算
    r = evaluatePresence(s, 5, T0 + 12 * MIN)
    expect(r.action).toBeNull()
    expect(r.state.activeStreakStart).toBe(T0 + 12 * MIN)
    s = r.state

    // 再连续活跃满阈值 → 又能提醒一次（新的一段）
    r = evaluatePresence(s, 5, T0 + 12 * MIN + SEDENTARY_MINUTES * MIN)
    expect(r.action).toBe('sedentary')
  })
})

describe('evaluatePresence — 久别归来', () => {
  test('从足够久的空闲回来 → returned', () => {
    let s = initialPresence()
    s = evaluatePresence(s, 5, T0).state
    // 进入并延续长时间空闲（峰值累积到 ≥ RETURN）
    s = evaluatePresence(s, BREAK_IDLE_SEC, T0 + 5 * MIN).state
    s = evaluatePresence(s, RETURN_IDLE_SEC, T0 + 20 * MIN).state
    // 回来
    const r = evaluatePresence(s, 3, T0 + 21 * MIN)
    expect(r.action).toBe('returned')
    expect(r.state.idle).toBe(false)
  })

  test('只短暂离开（峰值 < RETURN）回来不打招呼', () => {
    let s = initialPresence()
    s = evaluatePresence(s, 5, T0).state
    s = evaluatePresence(s, BREAK_IDLE_SEC, T0 + 5 * MIN).state // 5min 空闲 < 15min
    const r = evaluatePresence(s, 3, T0 + 6 * MIN)
    expect(r.action).toBeNull()
  })
})

describe('shouldGreet — 冷却门控', () => {
  test('首次（null）放行；冷却内拦截；冷却后放行', () => {
    expect(shouldGreet(null, T0)).toBe(true)
    expect(shouldGreet(T0, T0 + GREET_COOLDOWN_MS - 1)).toBe(false)
    expect(shouldGreet(T0, T0 + GREET_COOLDOWN_MS)).toBe(true)
  })
})

describe('pickGreeting — 时段问候', () => {
  test('不同小时给不同口吻，均非空', () => {
    const hours = [2, 8, 12, 16, 20, 23]
    const lines = hours.map(pickGreeting)
    for (const l of lines) expect(l.length).toBeGreaterThan(0)
    expect(pickGreeting(8)).toContain('早')
    expect(new Set(lines).size).toBeGreaterThan(1)
  })
})
