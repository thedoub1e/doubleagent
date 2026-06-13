// 共享：跑 osascript + 把 TCC 未授权等错误翻成给小白看的友好提示。
import { execFile } from 'node:child_process'
import { promisify } from 'node:util'

export const runOsa = promisify(execFile)

export interface OsFailure {
  error: string
  needsPermission: boolean
}

// 未授权常见报错码/文案：-1728 / -10004 / "Not authorized to send Apple events"。
export function classifyOsError(e: unknown, what: string): OsFailure {
  const msg = e instanceof Error ? e.message : String(e)
  const needsPermission = /-1728|-10004|not authorized|not allowed|permission/i.test(msg)
  return {
    error: needsPermission
      ? `我还没拿到「${what}」权限呢——去 系统设置 › 隐私与安全性 › ${what} 里允许一下就好啦🐶`
      : `没成功：${msg}`,
    needsPermission
  }
}
