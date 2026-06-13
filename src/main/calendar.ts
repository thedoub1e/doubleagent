// 纯函数（无 electron / child_process）：读今天日历事件的 AppleScript 拼装 + 输出解析。
// 只读 —— 绝不新建/删除日历事件。OS 执行在 calendarOs.ts。

export interface CalendarEvent {
  title: string
  time: string // "HH:MM"，全天/无时间为 ''
}

/** 只读：取今天（本地 0 点到次日 0 点）所有日历的事件，逐行输出「summary\tH:M」。
 *  时间用 hours/minutes 组件而非日期字符串 → 规避 AppleScript date 字符串的 locale 坑。 */
export function buildTodayEventsScript(): string {
  return [
    'set d to current date',
    "set time of d to 0", // 本地今天 0 点
    'set d2 to d + (1 * days)',
    'set out to ""',
    'tell application "Calendar"',
    'repeat with c in calendars',
    'repeat with e in (every event of c whose start date ≥ d and start date < d2)',
    'set h to (hours of (start date of e)) as string',
    'set m to (minutes of (start date of e)) as string',
    'set out to out & (summary of e) & tab & h & ":" & m & linefeed',
    'end repeat',
    'end repeat',
    'end tell',
    'return out'
  ].join('\n')
}

function normalizeHM(hm: string): string {
  const m = /^(\d{1,2}):(\d{1,2})$/.exec(hm.trim())
  if (!m) return ''
  const h = Number(m[1])
  const min = Number(m[2])
  if (h > 23 || min > 59) return ''
  return `${String(h).padStart(2, '0')}:${String(min).padStart(2, '0')}`
}

/** 事件距现在还有多少分钟（仅按今天的 HH:MM 算）。无法解析或非今日时间返回 null。 */
export function eventLeadMinutes(timeHM: string, now: Date): number | null {
  const m = /^(\d{1,2}):(\d{2})$/.exec(timeHM.trim())
  if (!m) return null
  const h = Number(m[1])
  const min = Number(m[2])
  if (h > 23 || min > 59) return null
  return h * 60 + min - (now.getHours() * 60 + now.getMinutes())
}

/** 事件是否"即将开始"：还剩 1..withinMin 分钟（已开始/正好 0 分钟不算，避免迟到提醒）。 */
export function isUpcoming(timeHM: string, now: Date, withinMin: number): boolean {
  const lead = eventLeadMinutes(timeHM, now)
  return lead !== null && lead > 0 && lead <= withinMin
}

/** 解析 buildTodayEventsScript 输出为事件数组。 */
export function parseEventLines(stdout: string): CalendarEvent[] {
  return stdout
    .split('\n')
    .filter((l) => l.trim().length > 0)
    .map((line) => {
      // 不预 trim 整行：保留前导 tab，空标题（"\tH:M"）才能被识别并丢弃。
      const tab = line.indexOf('\t')
      if (tab === -1) return { title: line.trim(), time: '' }
      return { title: line.slice(0, tab).trim(), time: normalizeHM(line.slice(tab + 1)) }
    })
    .filter((e) => e.title.length > 0)
}
