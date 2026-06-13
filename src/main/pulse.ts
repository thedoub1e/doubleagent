// 纯函数（无 electron 依赖，便于单测）：主动找话题 bounded pulse 的触发判定。
// 北极星支柱①：久未聊 → 小狗先开口。务必 bounded（清醒时段 + 静默够久 + 冷却 + 每日上限），
// 主动而不烦人。生成 opener 的模型调用与人不在场判定在 index.ts。

import { dayKey } from './scheduleUtil'

const HOUR = 60 * 60 * 1000

export interface PulseConfig {
  /** 距上次互动至少静默这么久，才考虑主动开口。 */
  quietMs: number
  /** 两次主动开口的最小间隔。 */
  cooldownMs: number
  /** 只在 [startHour, endHour) 这个清醒时段主动（避免半夜打扰）。 */
  startHour: number
  endHour: number
  /** 每天最多主动开口次数。 */
  maxPerDay: number
}

export const DEFAULT_PULSE_CONFIG: PulseConfig = {
  quietMs: 4 * HOUR,
  cooldownMs: 3 * HOUR,
  startHour: 9,
  endHour: 22,
  maxPerDay: 3
}

export interface PulseState {
  /** 上次「用户主动互动」(发消息) 的时间戳。 */
  lastInteractionAt: number
  /** 上次小狗主动开口的时间戳；从未则 null。 */
  lastPulseAt: number | null
  /** lastPulseAt 所在的日期 key（用于每日上限按天重置）。 */
  pulseDay: string
  /** 当天已主动开口次数。 */
  pulsesToday: number
}

export function initialPulse(now: number): PulseState {
  return { lastInteractionAt: now, lastPulseAt: null, pulseDay: '', pulsesToday: 0 }
}

/** 当天已开口次数（跨天自动归零）。 */
function pulsesToday(state: PulseState, today: string): number {
  return state.pulseDay === today ? state.pulsesToday : 0
}

/** 此刻是否应主动开口（清醒时段 + 静默够久 + 冷却已过 + 未超每日上限）。 */
export function shouldPulse(state: PulseState, now: Date, cfg: PulseConfig = DEFAULT_PULSE_CONFIG): boolean {
  const hour = now.getHours()
  if (hour < cfg.startHour || hour >= cfg.endHour) return false
  const t = now.getTime()
  if (t - state.lastInteractionAt < cfg.quietMs) return false
  if (state.lastPulseAt !== null && t - state.lastPulseAt < cfg.cooldownMs) return false
  if (pulsesToday(state, dayKey(now)) >= cfg.maxPerDay) return false
  return true
}

/** 用户发了消息 → 刷新静默计时（重置"久未聊"）。 */
export function registerInteraction(state: PulseState, now: number): PulseState {
  return { ...state, lastInteractionAt: now }
}

/** 小狗主动开口后 → 记冷却 + 当天计数（跨天归零再 +1）。不动 lastInteractionAt（开口不是用户互动）。 */
export function registerPulse(state: PulseState, now: Date): PulseState {
  const today = dayKey(now)
  return {
    ...state,
    lastPulseAt: now.getTime(),
    pulseDay: today,
    pulsesToday: pulsesToday(state, today) + 1
  }
}

/** 模型不可用 / 没填 key 时的兜底开场白，按时段给点不同口吻。 */
export function pickOpenerFallback(hour: number): string {
  if (hour < 11) return '早上好呀～在忙什么呢？想你了，过来冒个泡🐶'
  if (hour < 14) return '到饭点啦，今天中午吃了什么好吃的？跟我说说嘛🐶'
  if (hour < 18) return '下午啦～学累了的话歇会儿，跟我聊两句呀🐶'
  return '忙了一天辛苦啦，现在感觉怎么样？我在这儿陪你聊聊🐶'
}
