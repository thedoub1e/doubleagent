// 纯函数（无 electron）：每日 nudge（config.reminders 里的定时提醒）的增/改/删，供对话工具调用。
// 「配置即对话」：用户说「每天9点提醒我学习」/「别在23:30喊我了」→ 这里做不可变更新。

import type { Reminder } from './config'

const HHMM = /^(\d{1,2}):(\d{1,2})$/

/** 规范化 "H:M"/"HH:MM" → "HH:MM"。非法返回 null。 */
export function normalizeTime(t: string): string | null {
  const m = HHMM.exec(t.trim())
  if (!m) return null
  const h = Number(m[1])
  const mi = Number(m[2])
  if (h > 23 || mi > 59) return null
  return `${String(h).padStart(2, '0')}:${String(mi).padStart(2, '0')}`
}

export interface UpsertResult {
  reminders: Reminder[]
  time: string
  updated: boolean // true=改了已有时段的文案，false=新增
}

/** 增/改每日提醒：同一时段已存在则替换文案并启用，否则新增。时间非法返回 null。
 *  id 由时段派生（每个时段一条），天然去重、可重复 upsert。 */
export function upsertDailyReminder(
  reminders: Reminder[],
  time: string,
  message: string
): UpsertResult | null {
  const t = normalizeTime(time)
  if (t === null) return null
  const text = message.trim()
  const idx = reminders.findIndex((r) => r.time === t)
  if (idx >= 0) {
    const next = reminders.map((r, i) =>
      i === idx ? { ...r, message: text.length > 0 ? text : r.message, enabled: true } : r
    )
    return { reminders: next, time: t, updated: true }
  }
  const added: Reminder = { id: `nudge-${t.replace(':', '')}`, time: t, message: text, enabled: true }
  return { reminders: [...reminders, added], time: t, updated: false }
}

/** 取消每日提醒：按时段精确匹配 或 按关键词命中文案（任一满足即删）。返回新数组 + 删除条数。 */
export function cancelDailyReminders(
  reminders: Reminder[],
  opts: { time?: string; keyword?: string }
): { reminders: Reminder[]; removed: number } {
  const t = opts.time ? normalizeTime(opts.time) : null
  const kw = (opts.keyword ?? '').trim()
  const keep = reminders.filter((r) => {
    const byTime = t !== null && r.time === t
    const byKeyword = kw.length > 0 && r.message.includes(kw)
    return !(byTime || byKeyword)
  })
  return { reminders: keep, removed: reminders.length - keep.length }
}
