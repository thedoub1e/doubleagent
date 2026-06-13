// 纯函数（无 electron）：计划式番茄钟/学习计划 —— 按每天或每周几自动进入专注。
// 调度（到点自动 startFocus）在 index.ts；这里只管「此刻该不该触发」与文案。

import { hhmm, dayKey } from './scheduleUtil'

export interface FocusPlan {
  id: string
  days: number[] // 0=周日…6=周六；空数组 = 每天
  time: string // "HH:MM"
  minutes: number // 专注时长
  enabled: boolean
}

const WEEKDAY_CN = ['日', '一', '二', '三', '四', '五', '六']

/** 此刻是否该触发该计划：启用 + 今天是计划日（或每天）+ 分钟匹配。 */
export function isPlanDue(plan: FocusPlan, now: Date): boolean {
  if (!plan.enabled) return false
  if (plan.days.length > 0 && !plan.days.includes(now.getDay())) return false
  return plan.time === hhmm(now)
}

/** 当天去重 key（同一计划今天只触发一次）。 */
export function planDayFireKey(plan: FocusPlan, now: Date): string {
  return `focusplan:${plan.id}@${dayKey(now)}`
}

/** 规范化星期数组：去重、过滤非法(0-6)、排序；7 视作 0(周日)。 */
export function normalizeDays(days: unknown): number[] {
  if (!Array.isArray(days)) return []
  const set = new Set<number>()
  for (const d of days) {
    const n = Number(d)
    if (!Number.isInteger(n)) continue
    const wd = n === 7 ? 0 : n
    if (wd >= 0 && wd <= 6) set.add(wd)
  }
  return [...set].sort((a, b) => a - b)
}

/** 人话描述：「每天 09:00 专注 25 分钟」/「周一三五 20:00 专注 60 分钟」。 */
export function describePlan(plan: FocusPlan): string {
  const when =
    plan.days.length === 0 || plan.days.length === 7
      ? '每天'
      : '周' + plan.days.map((d) => WEEKDAY_CN[d]).join('')
  return `${when} ${plan.time} 专注 ${plan.minutes} 分钟`
}
