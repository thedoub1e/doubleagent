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
