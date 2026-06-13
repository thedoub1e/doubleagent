import { existsSync, readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { app } from 'electron'
import { dayKey } from './scheduleUtil'

// 持久化"今天已触发"的提醒键：重启后不重复发，且让补发知道哪些今天已发过。
// 只保留当天的键（按 key 的日期段过滤），避免文件无限增长。
function firedPath(): string {
  return join(app.getPath('userData'), 'fired.json')
}

let cache: Set<string> | null = null

/** 加载今天已触发的键集合（首次调用按当天日期裁剪历史键）。 */
export function loadFiredKeys(now: Date): Set<string> {
  if (cache) return cache
  const today = dayKey(now)
  try {
    const raw = existsSync(firedPath())
      ? (JSON.parse(readFileSync(firedPath(), 'utf-8')) as string[])
      : []
    // key 形如 id@YYYY-M-D[@HH:MM]，日期段是 split('@')[1]，精确比较避免 6-1 误配 6-13。
    cache = new Set(raw.filter((k) => k.split('@')[1] === today))
  } catch {
    cache = new Set()
  }
  return cache
}

/** 记录一个键已触发并落盘。 */
export function addFiredKey(key: string): void {
  const set = cache ?? new Set<string>()
  set.add(key)
  cache = set
  try {
    writeFileSync(firedPath(), JSON.stringify([...set]), 'utf-8')
  } catch {
    // 落盘失败不致命：本次会话内存里仍去重，最坏重启后可能重发一次。
  }
}
