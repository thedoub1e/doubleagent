import { loadConfig, type Reminder } from './config'
import { fireKey, isDue } from './scheduleUtil'

// 轻量调度器：每 30s 检查一次；命中某条启用提醒的 HH:MM 且当天未触发过 → 回调。
const CHECK_INTERVAL_MS = 30_000

const firedKeys = new Set<string>()
let timer: ReturnType<typeof setInterval> | null = null

export function startScheduler(onFire: (reminder: Reminder) => void): void {
  if (timer) return
  const tick = (): void => {
    const cfg = loadConfig()
    if (!cfg.supervisionEnabled) return
    const now = new Date()
    for (const reminder of cfg.reminders) {
      if (!isDue(reminder, now)) continue
      const key = fireKey(reminder, now)
      if (firedKeys.has(key)) continue
      firedKeys.add(key)
      onFire(reminder)
    }
  }
  timer = setInterval(tick, CHECK_INTERVAL_MS)
  tick()
}
