// OS 副作用层：真正调用 osascript。与纯函数 reminders.ts 分离（这里不单测，逻辑都在那边）。
// 安全：脚本一律由 reminders.ts 的拼装器生成（已转义），execFile 数组传参 → 无 shell 注入面。
import { classifyOsError, runOsa as run } from './osShared'
import {
  buildCompleteReminderScript,
  buildCreateReminderScript,
  buildListNamesScript,
  buildListRemindersScript,
  parseReminderTitles,
  type CreateReminderOpts
} from './reminders'

export type OsResult<T> =
  | { ok: true; value: T }
  | { ok: false; error: string; needsPermission: boolean }

const classifyError = (e: unknown): { error: string; needsPermission: boolean } =>
  classifyOsError(e, '提醒事项')

/** 只读探针：列出提醒列表名。用于验证 osascript 通道 + TCC 授权，绝不写入任何数据。 */
export async function listReminderListNames(): Promise<OsResult<string[]>> {
  try {
    const { stdout } = await run('osascript', ['-e', buildListNamesScript()])
    const names = stdout
      .trim()
      .split(',')
      .map((s) => s.trim())
      .filter(Boolean)
    return { ok: true, value: names }
  } catch (e) {
    return { ok: false, ...classifyError(e) }
  }
}

/** 写入路径：新建提醒。调用方负责确认列表（默认列表或指定的废弃测试列表）。 */
export async function createReminder(opts: CreateReminderOpts): Promise<OsResult<void>> {
  try {
    await run('osascript', ['-e', buildCreateReminderScript(opts)])
    return { ok: true, value: undefined }
  } catch (e) {
    return { ok: false, ...classifyError(e) }
  }
}

/** 只读：列出未完成提醒标题（简报 / 闭环跟进用）。 */
export async function listReminders(list?: string): Promise<OsResult<string[]>> {
  try {
    const { stdout } = await run('osascript', ['-e', buildListRemindersScript(list)])
    return { ok: true, value: parseReminderTitles(stdout) }
  } catch (e) {
    return { ok: false, ...classifyError(e) }
  }
}

/** 核销：把首个匹配标题的未完成提醒标记完成。 */
export async function completeReminder(title: string, list?: string): Promise<OsResult<void>> {
  try {
    await run('osascript', ['-e', buildCompleteReminderScript(title, list)])
    return { ok: true, value: undefined }
  } catch (e) {
    return { ok: false, ...classifyError(e) }
  }
}
