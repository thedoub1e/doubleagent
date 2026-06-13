import type { Reminder } from './config'

// 纯函数（无 electron 依赖，便于单测）：调度的时间判定逻辑。

export function hhmm(d: Date): string {
  return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`
}

export function dayKey(d: Date): string {
  return `${d.getFullYear()}-${d.getMonth() + 1}-${d.getDate()}`
}

/** 该提醒此刻是否应触发（启用且分钟匹配）。 */
export function isDue(reminder: Reminder, now: Date): boolean {
  return reminder.enabled && reminder.time === hhmm(now)
}

/** 当天同一分钟的去重 key。 */
export function fireKey(reminder: Reminder, now: Date): string {
  return `${reminder.id}@${dayKey(now)}@${hhmm(now)}`
}

/** 当天的去重 key（与具体分钟无关）：补发场景下保证"今天这条只发一次"。 */
export function dayFireKey(reminder: Reminder, now: Date): string {
  return `${reminder.id}@${dayKey(now)}`
}

export function minutesOfDay(d: Date): number {
  return d.getHours() * 60 + d.getMinutes()
}

/** 提醒设定时刻的当天分钟数（"HH:MM" → 分钟）。非法时间返回 -1。 */
export function reminderMinutes(reminder: Reminder): number {
  const m = /^(\d{1,2}):(\d{2})$/.exec(reminder.time)
  if (!m) return -1
  const hours = Number(m[1])
  const mins = Number(m[2])
  if (hours > 23 || mins > 59) return -1
  return hours * 60 + mins
}

/** 错过补发判定：启用、设定时刻今天已过、且过去未超过 graceMinutes（太久就别补，免得半夜炸）。
 *  恰好同一分钟由 isDue 负责，这里只管"已过但还新鲜"。 */
export function isMissed(reminder: Reminder, now: Date, graceMinutes: number): boolean {
  if (!reminder.enabled) return false
  const rm = reminderMinutes(reminder)
  if (rm < 0) return false
  const nowM = minutesOfDay(now)
  return rm < nowM && nowM - rm <= graceMinutes
}
