import { existsSync, readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { app } from 'electron'
import { initialStreak, type StreakState } from './pomodoro'

// 番茄钟打卡 streak 持久化（userData/pomodoro.json）。重启不丢连续天数。
function streakPath(): string {
  return join(app.getPath('userData'), 'pomodoro.json')
}

let cache: StreakState | null = null

// 旧格式（只有 todayCount，无 daily）→ 迁移成按天记账：把 todayCount 记到 lastDate 那天。
interface LegacyStreak {
  lastDate?: string
  currentStreak?: number
  bestStreak?: number
  todayCount?: number
  daily?: Record<string, number>
}
function migrate(raw: LegacyStreak): StreakState {
  const base = initialStreak()
  const daily =
    raw.daily ?? (raw.lastDate && raw.todayCount ? { [raw.lastDate]: raw.todayCount } : {})
  return {
    lastDate: raw.lastDate ?? base.lastDate,
    currentStreak: raw.currentStreak ?? base.currentStreak,
    bestStreak: raw.bestStreak ?? base.bestStreak,
    daily
  }
}

export function loadStreak(): StreakState {
  if (cache) return cache
  try {
    cache = existsSync(streakPath())
      ? migrate(JSON.parse(readFileSync(streakPath(), 'utf-8')) as LegacyStreak)
      : initialStreak()
  } catch {
    cache = initialStreak()
  }
  return cache
}

export function saveStreak(state: StreakState): void {
  cache = state
  try {
    writeFileSync(streakPath(), JSON.stringify(state), 'utf-8')
  } catch {
    // 非致命：内存里仍有当前 streak。
  }
}
