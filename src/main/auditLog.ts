import { appendFileSync } from 'node:fs'
import { join } from 'node:path'
import { app } from 'electron'

// 危险操作审计日志（Path B · Phase 2）：写文件/跑命令等记一行到 userData/audit.log，可回溯。
export function auditLog(entry: string): void {
  try {
    // 防日志注入：把换行压成空格，一条审计就是一行。
    const safe = (entry ?? '').replace(/[\r\n]+/g, ' ')
    const line = `[${new Date().toISOString()}] ${safe}\n`
    appendFileSync(join(app.getPath('userData'), 'audit.log'), line, 'utf-8')
  } catch {
    // 审计写失败不致命，不影响主流程
  }
}
