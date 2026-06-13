// 纯函数（无 electron 依赖，便于单测）：在场感知 —— 解锁/唤醒问候 + 久坐感知。
// 输入是系统空闲秒数（powerMonitor.getSystemIdleTime）与时间戳，输出新状态 + 应触发的动作。
// 所有判定都做 bounded（冷却 / 每段久坐只提醒一次），避免刷屏。

const MINUTE = 60_000

// —— 久坐感知阈值 ——
/** 空闲超过此秒数 → 视作"休息了"，重置当前活跃连续段。 */
export const BREAK_IDLE_SEC = 5 * 60
/** 连续活跃达到此分钟数 → 提醒起来走走（每段只提醒一次）。 */
export const SEDENTARY_MINUTES = 50
/** 从这么久的空闲回来 → 主动说一句"回来啦"。 */
export const RETURN_IDLE_SEC = 15 * 60
/** 解锁/唤醒/久别归来问候的冷却：同类问候至少间隔这么久才再说一次。 */
export const GREET_COOLDOWN_MS = 30 * MINUTE

export interface PresenceState {
  /** 当前连续活跃段的开始时间戳（ms）；处于休息/空闲时为 null。 */
  activeStreakStart: number | null
  /** 本活跃段是否已提醒过久坐（每段只提醒一次）。 */
  nudgedThisStreak: boolean
  /** 上一拍是否处于空闲/休息态。 */
  idle: boolean
  /** 当前空闲段观测到的最大空闲秒数（用于判断回来时要不要打招呼）。 */
  idlePeakSec: number
}

export type PresenceAction = 'sedentary' | 'returned' | null

export function initialPresence(): PresenceState {
  return { activeStreakStart: null, nudgedThisStreak: false, idle: false, idlePeakSec: 0 }
}

/**
 * 根据本拍空闲秒数推进在场状态。
 * - 空闲 ≥ BREAK_IDLE_SEC：进入/延续休息，记录空闲峰值，重置活跃段。
 * - 活跃且上拍在休息：判定为"回来了"，空闲峰值够久则 action='returned'。
 * - 活跃且连续段 ≥ SEDENTARY_MINUTES 且本段没提醒过：action='sedentary'。
 */
export function evaluatePresence(
  state: PresenceState,
  idleSeconds: number,
  now: number
): { state: PresenceState; action: PresenceAction } {
  // 休息/空闲中。
  if (idleSeconds >= BREAK_IDLE_SEC) {
    const peak = state.idle ? Math.max(state.idlePeakSec, idleSeconds) : idleSeconds
    return {
      state: { activeStreakStart: null, nudgedThisStreak: false, idle: true, idlePeakSec: peak },
      action: null
    }
  }

  // 刚从休息回来。
  if (state.idle) {
    const action: PresenceAction = state.idlePeakSec >= RETURN_IDLE_SEC ? 'returned' : null
    return {
      state: { activeStreakStart: now, nudgedThisStreak: false, idle: false, idlePeakSec: 0 },
      action
    }
  }

  // 持续活跃中。
  const start = state.activeStreakStart ?? now
  const continuousMs = now - start
  if (continuousMs >= SEDENTARY_MINUTES * MINUTE && !state.nudgedThisStreak) {
    return {
      state: { activeStreakStart: start, nudgedThisStreak: true, idle: false, idlePeakSec: 0 },
      action: 'sedentary'
    }
  }
  return {
    state: { activeStreakStart: start, nudgedThisStreak: state.nudgedThisStreak, idle: false, idlePeakSec: 0 },
    action: null
  }
}

/** 冷却门控：lastAt 为 null 或已超过冷却时长才放行（解锁/久别归来问候共用，免叠加刷屏）。 */
export function shouldGreet(lastAt: number | null, now: number, cooldownMs: number = GREET_COOLDOWN_MS): boolean {
  return lastAt === null || now - lastAt >= cooldownMs
}

/** 按一天中的小时挑一句解锁/归来问候，带点时段感。 */
export function pickGreeting(hour: number): string {
  if (hour < 5) return '这么晚还醒着呀？别熬太久，我陪你一会儿就去睡哦🐶🌙'
  if (hour < 11) return '早呀～新的一天开始啦，今天也一起加油吧🐶☀️'
  if (hour < 14) return '回来啦！记得好好吃午饭哦，别饿着自己🐶'
  if (hour < 18) return '嗨，回来啦～下午也要元气满满呀🐶'
  if (hour < 23) return '晚上好呀，今天辛苦啦，我在这儿陪你🐶'
  return '夜深啦还在忙吗？注意休息，我一直都在🐶🌙'
}
