// 纯函数（无 electron）：番茄钟打卡 streak 的连续天数计算 + 文案。计时编排在 index.ts。

export const DEFAULT_FOCUS_MINUTES = 25
export const MAX_FOCUS_MINUTES = 120

export interface StreakState {
  lastDate: string // 上次完成番茄钟的日期 "YYYY-MM-DD"，从未则 ''
  currentStreak: number // 当前连续专注天数
  bestStreak: number // 历史最长连续天数
  todayCount: number // 今天已完成番茄钟数
}

export function initialStreak(): StreakState {
  return { lastDate: '', currentStreak: 0, bestStreak: 0, todayCount: 0 }
}

/** 本地日期 "YYYY-MM-DD"。 */
export function ymd(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

/** 两个 "YYYY-MM-DD" 相差天数（today - last）。用 UTC 零点避免夏令时偏差。 */
function dayGap(today: string, last: string): number {
  const [ay, am, ad] = today.split('-').map(Number)
  const [by, bm, bd] = last.split('-').map(Number)
  return Math.round((Date.UTC(ay, am - 1, ad) - Date.UTC(by, bm - 1, bd)) / 86_400_000)
}

/**
 * 完成一个番茄钟 → 更新 streak（不可变）。
 * - 同一天再完成：todayCount+1，连续天数不变。
 * - 恰好昨天完成过：连续天数 +1，todayCount 归 1。
 * - 隔了 ≥2 天 / 首次：连续天数重置为 1，todayCount 归 1。
 */
export function recordCompletion(state: StreakState, now: Date): StreakState {
  const today = ymd(now)
  if (state.lastDate === today) {
    return { ...state, todayCount: state.todayCount + 1 }
  }
  const continued = state.lastDate !== '' && dayGap(today, state.lastDate) === 1
  const currentStreak = continued ? state.currentStreak + 1 : 1
  return {
    lastDate: today,
    currentStreak,
    bestStreak: Math.max(state.bestStreak, currentStreak),
    todayCount: 1
  }
}

/** 完成时的庆祝文案。 */
export function streakLine(state: StreakState): string {
  const head = `🍅 完成今天第 ${state.todayCount} 个番茄钟！`
  if (state.currentStreak <= 1) return `${head}棒棒哒，继续保持🐶`
  const best =
    state.currentStreak === state.bestStreak && state.bestStreak > 1 ? '（新纪录！）' : ''
  return `${head}🔥 已连续专注 ${state.currentStreak} 天${best}，太厉害啦🐶`
}
