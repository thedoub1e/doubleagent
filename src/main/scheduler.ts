import { loadConfig, type AppConfig, type Reminder } from './config'
import { dayFireKey, isDue, isMissed } from './scheduleUtil'
import { addFiredKey, loadFiredKeys } from './firedStore'

// 轻量调度器：每 30s 检查一次。命中某条启用提醒的 HH:MM（或关机错过、仍在补发窗口内）
// 且今天未触发过 → 回调。已触发键持久化（重启不重复发；关机错过的开机即补）。
const CHECK_INTERVAL_MS = 30_000
const MISSED_GRACE_MINUTES = 120 // 错过超过 2 小时就不补了，免得半夜炸提醒

// 简报伪 id（无具体文案，触发时由 index 动态合成今天的待办播报）。
export const BRIEFING_MORNING_ID = 'briefing:morning'
export const BRIEFING_EVENING_ID = 'briefing:evening'

// 所有可调度项 = 用户提醒 + 晨/晚简报（统一走相同的去重 / 补发逻辑）。
function schedulables(cfg: AppConfig): Reminder[] {
  return [
    ...cfg.reminders,
    { id: BRIEFING_MORNING_ID, time: cfg.morningBriefing.time, message: '', enabled: cfg.morningBriefing.enabled },
    { id: BRIEFING_EVENING_ID, time: cfg.eveningBriefing.time, message: '', enabled: cfg.eveningBriefing.enabled }
  ]
}

let timer: ReturnType<typeof setInterval> | null = null

export function startScheduler(onFire: (reminder: Reminder) => void): void {
  if (timer) return
  const tick = (): void => {
    const cfg = loadConfig()
    if (!cfg.supervisionEnabled) return
    const now = new Date()
    const fired = loadFiredKeys(now)
    for (const reminder of schedulables(cfg)) {
      const due = isDue(reminder, now)
      const missed = !due && isMissed(reminder, now, MISSED_GRACE_MINUTES)
      if (!due && !missed) continue
      // 按天去重：同一条今天只发一次（无论按点触发还是开机补发）。
      const key = dayFireKey(reminder, now)
      if (fired.has(key)) continue
      addFiredKey(key)
      onFire(reminder)
    }
  }
  timer = setInterval(tick, CHECK_INTERVAL_MS)
  tick()
}
