import { describe, expect, test } from 'vitest'
import {
  DEFAULT_PULSE_CONFIG,
  initialPulse,
  pickOpenerFallback,
  registerInteraction,
  registerPulse,
  shouldPulse,
  type PulseState
} from '../src/main/pulse'

const HOUR = 60 * 60 * 1000
// 2026-06-13 是周六；构造清醒时段(10:00)的基准时间。
const base = (h = 10, m = 0): Date => new Date(2026, 5, 13, h, m)

const state = (over: Partial<PulseState> = {}): PulseState => ({
  lastInteractionAt: base(10).getTime() - 5 * HOUR, // 默认已静默 5h
  lastPulseAt: null,
  pulseDay: '',
  pulsesToday: 0,
  ...over
})

describe('shouldPulse', () => {
  test('静默够久 + 清醒时段 + 无冷却 → 应开口', () => {
    expect(shouldPulse(state(), base(10))).toBe(true)
  })

  test('静默不够久 → 不开口', () => {
    const s = state({ lastInteractionAt: base(10).getTime() - 1 * HOUR })
    expect(shouldPulse(s, base(10))).toBe(false)
  })

  test('非清醒时段（半夜/清早）→ 不开口', () => {
    expect(shouldPulse(state(), base(3))).toBe(false) // 凌晨 3 点
    expect(shouldPulse(state(), base(23))).toBe(false) // 晚 11 点（endHour=22）
  })

  test('冷却内 → 不开口；冷却过 → 开口', () => {
    const justPulsed = state({ lastPulseAt: base(10).getTime() - 1 * HOUR })
    expect(shouldPulse(justPulsed, base(10))).toBe(false)
    const cooled = state({ lastPulseAt: base(10).getTime() - DEFAULT_PULSE_CONFIG.cooldownMs })
    expect(shouldPulse(cooled, base(10))).toBe(true)
  })

  test('当天已达上限 → 不开口；跨天归零 → 可开口', () => {
    const today = `2026-6-13`
    const capped = state({ pulseDay: today, pulsesToday: DEFAULT_PULSE_CONFIG.maxPerDay })
    expect(shouldPulse(capped, base(10))).toBe(false)
    // 同样的计数但属于昨天 → 视作 0
    const yesterday = state({ pulseDay: '2026-6-12', pulsesToday: DEFAULT_PULSE_CONFIG.maxPerDay })
    expect(shouldPulse(yesterday, base(10))).toBe(true)
  })
})

describe('registerInteraction / registerPulse', () => {
  test('registerInteraction 刷新静默计时', () => {
    const s = registerInteraction(state(), base(10).getTime())
    expect(s.lastInteractionAt).toBe(base(10).getTime())
    expect(shouldPulse(s, base(10))).toBe(false) // 刚互动 → 不该开口
  })

  test('registerPulse 记冷却 + 当天计数，跨天归零再 +1', () => {
    let s = registerPulse(state(), base(10))
    expect(s.pulsesToday).toBe(1)
    expect(s.lastPulseAt).toBe(base(10).getTime())
    s = registerPulse(s, base(12))
    expect(s.pulsesToday).toBe(2)
    // 次日首次开口 → 计数回到 1
    const nextDay = registerPulse(s, new Date(2026, 5, 14, 10))
    expect(nextDay.pulsesToday).toBe(1)
  })

  test('registerPulse 不动 lastInteractionAt', () => {
    const before = state()
    const after = registerPulse(before, base(10))
    expect(after.lastInteractionAt).toBe(before.lastInteractionAt)
  })
})

describe('pickOpenerFallback', () => {
  test('各时段均非空且有差异', () => {
    const lines = [9, 12, 16, 20].map(pickOpenerFallback)
    for (const l of lines) expect(l.length).toBeGreaterThan(0)
    expect(new Set(lines).size).toBeGreaterThan(1)
  })
})

test('initialPulse 以当前时刻为最近互动', () => {
  const t = base(10).getTime()
  expect(initialPulse(t).lastInteractionAt).toBe(t)
})
