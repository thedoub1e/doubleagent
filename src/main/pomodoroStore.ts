import { existsSync, readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { app } from 'electron'
import { initialStreak, type StreakState } from './pomodoro'

// 番茄钟打卡 streak 持久化（userData/pomodoro.json）。重启不丢连续天数。
function streakPath(): string {
  return join(app.getPath('userData'), 'pomodoro.json')
}

let cache: StreakState | null = null

export function loadStreak(): StreakState {
  if (cache) return cache
  try {
    cache = existsSync(streakPath())
      ? { ...initialStreak(), ...(JSON.parse(readFileSync(streakPath(), 'utf-8')) as Partial<StreakState>) }
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
