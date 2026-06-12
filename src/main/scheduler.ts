import { loadConfig, type Reminder } from './config'

// 轻量调度器：每 30s 检查一次；命中某条启用提醒的 HH:MM 且当天未触发过 → 回调。
const CHECK_INTERVAL_MS = 30_000

const firedKeys = new Set<string>()
let timer: ReturnType<typeof setInterval> | null = null

function hhmm(d: Date): string {
  return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`
}

function dayKey(d: Date): string {
  return `${d.getFullYear()}-${d.getMonth() + 1}-${d.getDate()}`
}

export function startScheduler(onFire: (reminder: Reminder) => void): void {
  if (timer) return
  const tick = (): void => {
    const cfg = loadConfig()
    if (!cfg.supervisionEnabled) return
    const now = new Date()
    const current = hhmm(now)
    for (const reminder of cfg.reminders) {
      if (!reminder.enabled || reminder.time !== current) continue
      const key = `${reminder.id}@${dayKey(now)}@${current}`
      if (firedKeys.has(key)) continue
      firedKeys.add(key)
      onFire(reminder)
    }
  }
  timer = setInterval(tick, CHECK_INTERVAL_MS)
  tick()
}
