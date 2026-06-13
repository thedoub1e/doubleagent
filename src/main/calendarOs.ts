// OS 副作用层：读今天日历事件（只读）。逻辑在纯函数 calendar.ts。
import { classifyOsError, runOsa as run } from './osShared'
import { buildTodayEventsScript, parseEventLines, type CalendarEvent } from './calendar'

export type CalResult =
  | { ok: true; value: CalendarEvent[] }
  | { ok: false; error: string; needsPermission: boolean }

/** 只读：今天的日历事件（简报 / 行程前置提醒用）。 */
export async function listTodayEvents(): Promise<CalResult> {
  try {
    const { stdout } = await run('osascript', ['-e', buildTodayEventsScript()])
    return { ok: true, value: parseEventLines(stdout) }
  } catch (e) {
    return { ok: false, ...classifyOsError(e, '日历') }
  }
}
