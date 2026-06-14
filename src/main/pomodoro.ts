// 纯函数（无 electron）：番茄钟打卡统计 —— 按天记账（daily map），今日数/本周数/连续天数都按「现在」实时算，
// 跨天自动刷新（不再出现"新的一天还显示昨天的次数"）。计时编排在 index.ts。

export const DEFAULT_FOCUS_MINUTES = 25
export const MAX_FOCUS_MINUTES = 120
const KEEP_DAYS = 40 // 只保留近 40 天的每日记录，限制体积

export interface StreakState {
  lastDate: string // 最近完成番茄钟的日期 "YYYY-MM-DD"
  currentStreak: number // 完成时算出的连续天数（展示时再按今天校正是否仍有效）
  bestStreak: number
  daily: Record<string, number> // 日期 → 当天完成数
}

/** 给渲染层的派生视图：全部按「现在」实时算。 */
export interface StreakView {
  currentStreak: number
  bestStreak: number
  todayCount: number
  weekCount: number // 最近 7 天（含今天）完成数
}

export function initialStreak(): StreakState {
  return { lastDate: '', currentStreak: 0, bestStreak: 0, daily: {} }
}

/** 本地日期 "YYYY-MM-DD"。 */
export function ymd(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

/** 日期 key 往前推 n 天（用本地 Date 处理月份/年份滚动）。 */
function dayKeyMinus(key: string, n: number): string {
  const [y, m, d] = key.split('-').map(Number)
  return ymd(new Date(y, m - 1, d - n))
}

/** 从 todayKey 往回数连续有完成的天数。 */
function computeStreak(daily: Record<string, number>, todayKey: string): number {
  let n = 0
  let k = todayKey
  while ((daily[k] ?? 0) > 0) {
    n++
    k = dayKeyMinus(k, 1)
  }
  return n
}

/** 裁剪到近 KEEP_DAYS 天，限制 daily 体积。 */
function prune(daily: Record<string, number>, todayKey: string): Record<string, number> {
  const cutoff = dayKeyMinus(todayKey, KEEP_DAYS)
  const next: Record<string, number> = {}
  for (const [k, v] of Object.entries(daily)) {
    if (k >= cutoff) next[k] = v // "YYYY-MM-DD" 字符串可直接比较
  }
  return next
}

/** 完成一个番茄钟 → 当天 +1，重算连续天数（不可变）。 */
export function recordCompletion(state: StreakState, now: Date): StreakState {
  const today = ymd(now)
  const daily = prune({ ...state.daily, [today]: (state.daily[today] ?? 0) + 1 }, today)
  const currentStreak = computeStreak(daily, today)
  return {
    lastDate: today,
    currentStreak,
    bestStreak: Math.max(state.bestStreak, currentStreak),
    daily
  }
}

/** 近 7 天（含今天）完成总数。 */
function weekSum(daily: Record<string, number>, todayKey: string): number {
  let s = 0
  for (let i = 0; i < 7; i++) s += daily[dayKeyMinus(todayKey, i)] ?? 0
  return s
}

/** 派生视图：今日数按今天实时取；连续天数仅当最近完成是今天或昨天才有效，否则视为断签 0。 */
export function toView(state: StreakState, now: Date): StreakView {
  const today = ymd(now)
  const alive = state.lastDate === today || state.lastDate === dayKeyMinus(today, 1)
  return {
    currentStreak: alive ? state.currentStreak : 0,
    bestStreak: state.bestStreak,
    todayCount: state.daily[today] ?? 0,
    weekCount: weekSum(state.daily, today)
  }
}

/** 完成时的庆祝文案（用派生视图）。 */
export function streakLine(view: StreakView): string {
  const head = `🍅 完成今天第 ${view.todayCount} 个番茄钟！`
  if (view.currentStreak <= 1) return `${head}棒棒哒，继续保持🐶`
  const best = view.currentStreak === view.bestStreak && view.bestStreak > 1 ? '（新纪录！）' : ''
  return `${head}🔥 已连续专注 ${view.currentStreak} 天${best}，太厉害啦🐶`
}
