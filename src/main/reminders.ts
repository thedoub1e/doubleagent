// 纯函数（无 electron / 无 child_process 依赖，便于单测）：把"对话转待办"所需的
// 日期解析 + locale-safe AppleScript 脚本拼装 + 人话格式化拆成可验证的小块。
// OS 副作用（真正跑 osascript）放在 remindersOs.ts，本文件绝不执行任何东西。

/** 转义将要内嵌进 AppleScript 字符串字面量的值：先转义反斜杠，再转义双引号。
 *  防止标题/列表名里的引号闭合字符串导致脚本逃逸（安全边界）。 */
export function escapeAppleScript(s: string): string {
  return s.replace(/\\/g, '\\\\').replace(/"/g, '\\"')
}

export interface ParsedDue {
  date: Date
  hasTime: boolean
}

const ISO_RE = /^(\d{4})-(\d{2})-(\d{2})(?:[T ](\d{2}):(\d{2})(?::(\d{2}))?)?$/

/** 解析模型传入的 ISO 日期（`YYYY-MM-DD` 或 `YYYY-MM-DD[T| ]HH:MM[:SS]`）为本地时间 Date。
 *  手动构造本地 Date（不用 `new Date(str)` 以避开 date-only 被当 UTC 的时区坑），
 *  并做范围校验 + 回写校验（拒绝 2026-13-40 这类非法值）。非法返回 null（边界验证）。 */
export function parseIsoDate(iso: string): ParsedDue | null {
  const m = ISO_RE.exec(iso.trim())
  if (!m) return null
  const [, y, mo, d, hh, mm, ss] = m
  const year = Number(y)
  const month = Number(mo) // 1-12
  const day = Number(d)
  const hasTime = hh !== undefined
  const hours = hasTime ? Number(hh) : 0
  const minutes = hasTime ? Number(mm) : 0
  const seconds = ss !== undefined ? Number(ss) : 0

  if (month < 1 || month > 12 || day < 1 || day > 31) return null
  if (hours > 23 || minutes > 59 || seconds > 59) return null

  const date = new Date(year, month - 1, day, hours, minutes, seconds, 0)
  // 回写校验：非法日期（如 6/31）会被 JS 归一化到别的月份 → 检测到则拒绝。
  if (
    date.getFullYear() !== year ||
    date.getMonth() !== month - 1 ||
    date.getDate() !== day
  ) {
    return null
  }
  return { date, hasTime }
}

const WEEKDAY_CN = ['日', '一', '二', '三', '四', '五', '六']

function pad2(n: number): string {
  return String(n).padStart(2, '0')
}

/** 人话回执用：`6月17日(周三) 09:05`。 */
export function formatDueHuman(d: Date): string {
  return `${d.getMonth() + 1}月${d.getDate()}日(周${WEEKDAY_CN[d.getDay()]}) ${pad2(d.getHours())}:${pad2(d.getMinutes())}`
}

/** 用数值 setter 构造 AppleScript 日期，避开 `date "..."` 字符串解析的 locale 坑。
 *  先把 day 置 1 防止"当前是 31 号、设到 30 天的月份"时溢出。 */
function buildDateFragment(d: Date, varName = 'theDate'): string {
  return [
    `set ${varName} to current date`,
    `set day of ${varName} to 1`,
    `set year of ${varName} to ${d.getFullYear()}`,
    `set month of ${varName} to ${d.getMonth() + 1}`,
    `set day of ${varName} to ${d.getDate()}`,
    `set hours of ${varName} to ${d.getHours()}`,
    `set minutes of ${varName} to ${d.getMinutes()}`,
    `set seconds of ${varName} to ${d.getSeconds()}`
  ].join('\n')
}

export interface CreateReminderOpts {
  title: string
  date?: Date // 有则设 due date + remind me date（到点 macOS 原生弹）；无则纯待办
  list?: string // 有则写进指定列表；无则写默认列表
  ensureList?: boolean // 指定列表不存在则先建（用于安全测试列表，避免写进用户既有列表）
}

/** 拼出"新建提醒"的 AppleScript。标题/列表名一律转义，杜绝脚本逃逸。 */
export function buildCreateReminderScript(opts: CreateReminderOpts): string {
  const title = escapeAppleScript(opts.title)
  const hasDate = opts.date !== undefined
  const props = hasDate
    ? `{name:"${title}", due date:theDate, remind me date:theDate}`
    : `{name:"${title}"}`
  const makeLine = `make new reminder with properties ${props}`

  const inner: string[] = []
  if (opts.list) {
    const list = escapeAppleScript(opts.list)
    if (opts.ensureList) {
      inner.push(`if not (exists list "${list}") then make new list with properties {name:"${list}"}`)
    }
    inner.push(`tell list "${list}"`, makeLine, 'end tell')
  } else {
    inner.push(makeLine)
  }

  const dateFragment = hasDate ? `${buildDateFragment(opts.date as Date)}\n` : ''
  return `${dateFragment}tell application "Reminders"\n${inner.join('\n')}\nend tell`
}

/** 只读探针：列出提醒列表名，用于验证 osascript 通道 + TCC 授权，绝不写入。 */
export function buildListNamesScript(): string {
  return 'tell application "Reminders" to return name of every list'
}

/** 只读：列出未完成提醒的标题（一行一个）。用于简报/闭环跟进（问"做了没"）。 */
export function buildListRemindersScript(list?: string): string {
  const loop = [
    'set out to ""',
    'repeat with r in (reminders whose completed is false)',
    'set out to out & (name of r) & linefeed',
    'end repeat'
  ]
  const inner = list
    ? [`tell list "${escapeAppleScript(list)}"`, ...loop, 'end tell']
    : loop
  return `tell application "Reminders"\n${inner.join('\n')}\nend tell\nreturn out`
}

/** 解析 buildListRemindersScript 的输出为标题数组（按行、去空白、去空行）。 */
export function parseReminderTitles(stdout: string): string[] {
  return stdout
    .split('\n')
    .map((s) => s.trim())
    .filter((s) => s.length > 0)
}

/** 把首个匹配标题的未完成提醒标记为完成（闭环核销）。标题转义防逃逸。 */
export function buildCompleteReminderScript(title: string, list?: string): string {
  const t = escapeAppleScript(title)
  const body = [
    `set matches to (reminders whose name is "${t}" and completed is false)`,
    'if (count of matches) > 0 then set completed of (item 1 of matches) to true'
  ]
  const inner = list ? [`tell list "${escapeAppleScript(list)}"`, ...body, 'end tell'] : body
  return `tell application "Reminders"\n${inner.join('\n')}\nend tell`
}
