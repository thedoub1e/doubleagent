// 纯函数：倒数日 / 纪念日的日期计算与文案。无 IO，可单测。
// one-time（倒计时，如考试/回国）：到点/里程碑天数提示。
// recurring（每年纪念日，如生日/在一起纪念日）：当天庆祝（带年数）。

export interface Anniversary {
  id: string
  name: string
  date: string // "YYYY-MM-DD"
  recurring: boolean
  enabled: boolean
}

function parseYMD(s: string): { y: number; m: number; d: number } | null {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(s.trim())
  if (!m) return null
  const y = Number(m[1])
  const mo = Number(m[2])
  const d = Number(m[3])
  if (mo < 1 || mo > 12 || d < 1 || d > 31) return null
  const dt = new Date(y, mo - 1, d)
  if (dt.getFullYear() !== y || dt.getMonth() !== mo - 1 || dt.getDate() !== d) return null
  return { y, m: mo, d }
}

const DAY_MS = 86_400_000
function midnight(dt: Date): number {
  return new Date(dt.getFullYear(), dt.getMonth(), dt.getDate()).getTime()
}
function daysBetween(now: Date, target: Date): number {
  return Math.round((midnight(target) - midnight(now)) / DAY_MS)
}

/** 一次性日期距今天的整天数（过去为负）。非法返回 null。 */
export function daysUntil(dateStr: string, now: Date): number | null {
  const p = parseYMD(dateStr)
  if (!p) return null
  return daysBetween(now, new Date(p.y, p.m - 1, p.d))
}

/** 每年重复的纪念日：距下一次（今年若已过则明年）的整天数。非法返回 null。 */
export function nextRecurringDays(dateStr: string, now: Date): number | null {
  const p = parseYMD(dateStr)
  if (!p) return null
  let lead = daysBetween(now, new Date(now.getFullYear(), p.m - 1, p.d))
  if (lead < 0) lead = daysBetween(now, new Date(now.getFullYear() + 1, p.m - 1, p.d))
  return lead
}

const ONE_TIME_MILESTONES = new Set([30, 14, 7, 3, 1])
const RECUR_MILESTONES = new Set([7, 3, 1])

/** 今天该不该为这个日子说点什么 → 返回播报文案，否则 null（避免天天念叨）。 */
export function anniversaryLine(ann: Anniversary, now: Date): string | null {
  if (!ann.enabled) return null

  if (ann.recurring) {
    const lead = nextRecurringDays(ann.date, now)
    if (lead === null) return null
    if (lead === 0) {
      const p = parseYMD(ann.date)
      const years = p ? now.getFullYear() - p.y : 0
      return years > 0 ? `🎉 今天是「${ann.name}」！已经第 ${years} 年啦～` : `🎉 今天是「${ann.name}」！`
    }
    return RECUR_MILESTONES.has(lead) ? `还有 ${lead} 天就是「${ann.name}」啦🎈` : null
  }

  const lead = daysUntil(ann.date, now)
  if (lead === null || lead < 0) return null
  if (lead === 0) return `🎯 今天就是「${ann.name}」！`
  return ONE_TIME_MILESTONES.has(lead) ? `距离「${ann.name}」还有 ${lead} 天` : null
}
