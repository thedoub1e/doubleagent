// 跨版本数据迁移框架：dataVersion + 有序迁移 + 迁移前备份 userData。
// 目的：新版若改了 userData 里记录的结构，启动时按版本有序迁移，且迁移前先备份，
// 做到「升级跨版本也绝不丢记录」。纯判定（pendingMigrations）可单测；runner 是 fs/electron 副作用。

import { app } from 'electron'
import { cpSync, existsSync, mkdirSync } from 'node:fs'
import { join } from 'node:path'
import { loadConfig, saveConfig } from './config'

export interface Migration {
  version: number // 目标版本：把数据升到这个版本要做的事
  describe: string
  run(userDataDir: string): void // 同步 fs 操作，改写 userData 文件
}

// 当前数据版本。将来要迁移时：CURRENT_DATA_VERSION +1，并往 MIGRATIONS 加一条 version=新值的迁移。
export const CURRENT_DATA_VERSION = 1

// 已注册的迁移（按需新增；暂无——框架就绪，历史的多会话迁移仍在 sessions.ts 内就地处理）。
export const MIGRATIONS: Migration[] = []

// 备份时会复制的 userData 关键记录文件（迁移写坏也能从 backup/ 捞回）。
const BACKUP_FILES = [
  'config.json',
  'sessions.json',
  'history.json',
  'memory.json',
  'profile.json',
  'pomodoro.json',
  'fired.json'
]

/** 纯函数：从 storedVersion 升到 target，需要跑哪些迁移（按 version 升序）。 */
export function pendingMigrations(
  stored: number,
  migrations: readonly Migration[],
  target: number
): Migration[] {
  return migrations
    .filter((m) => m.version > stored && m.version <= target)
    .slice()
    .sort((a, b) => a.version - b.version)
}

/** 迁移前把关键记录备份到 userData/backup/pre-v<target>/。best-effort，失败不阻断（但会记日志）。 */
function backupUserData(userDataDir: string, target: number): boolean {
  try {
    const dest = join(userDataDir, 'backup', `pre-v${target}`)
    mkdirSync(dest, { recursive: true })
    for (const f of BACKUP_FILES) {
      const src = join(userDataDir, f)
      if (existsSync(src)) cpSync(src, join(dest, f))
    }
    return true
  } catch {
    return false
  }
}

/**
 * 启动时运行数据迁移：读 config.dataVersion → 算待跑迁移 →（有则先备份再按序跑）→ 写回 CURRENT。
 * 无待跑迁移也会把 dataVersion 归正到 CURRENT（首次安装/无结构变化时零开销、不备份）。
 */
export function runDataMigrations(): { ran: number; backedUp: boolean } {
  const userDataDir = app.getPath('userData')
  const stored = loadConfig().dataVersion ?? 0
  if (stored >= CURRENT_DATA_VERSION) return { ran: 0, backedUp: false }

  const pending = pendingMigrations(stored, MIGRATIONS, CURRENT_DATA_VERSION)
  let backedUp = false
  if (pending.length > 0) {
    backedUp = backupUserData(userDataDir, CURRENT_DATA_VERSION)
    for (const m of pending) m.run(userDataDir)
  }
  saveConfig({ dataVersion: CURRENT_DATA_VERSION })
  return { ran: pending.length, backedUp }
}
