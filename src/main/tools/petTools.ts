// 线条小狗的「生活类」工具（Path B · Phase 0 迁移自 chat.ts 工具定义 + index.ts handleToolCalls）。
// 行为与重构前等价；只是把"定义在 chat、执行在 index"统一成自带 schema+run 的注册式模块。
import { loadConfig, saveConfig } from '../config'
import { formatDueHuman, parseIsoDate } from '../reminders'
import {
  completeReminder as osCompleteReminder,
  createReminder as osCreateReminder,
  listReminders as osListReminders
} from '../remindersOs'
import { weatherLine } from '../weatherNet'
import { cancelDailyReminders, normalizeTime, upsertDailyReminder } from '../reminderRules'
import { describePlan, normalizeDays, type FocusPlan } from '../focusPlanUtil'
import { daysUntil, type Anniversary } from '../anniversary'
import { DEFAULT_FOCUS_MINUTES, MAX_FOCUS_MINUTES } from '../pomodoro'
import { toToolDef } from './registry'
import type { ToolModule } from './types'

const DEFAULT_REMINDER_HOUR = 9 // 只给了日期没给时间时，默认早 9 点提醒

/** 把一个倒数日/纪念日写进 config，返回人话回执。 */
function addCountdown(name: string, date: string, recurring: boolean): string {
  if (name.length === 0) return ''
  const lead = daysUntil(date, new Date())
  if (lead === null) return '这个日期我没看懂呢，能给我个具体年月日吗？🐶'
  const ann: Anniversary = { id: `ann-${Date.now().toString(36)}`, name, date, recurring, enabled: true }
  saveConfig({ anniversaries: [...loadConfig().anniversaries, ann] })
  if (recurring) return `记好啦！以后每年「${name}」我都会记得💛`
  return lead >= 0
    ? `记好啦🎯 距离「${name}」还有 ${lead} 天，我帮你数着～`
    : `记好啦！「${name}」是 ${date}（已经过去咯）`
}

const createReminder: ToolModule = {
  name: 'create_reminder',
  description:
    '当用户想被提醒做某事、记一个待办或安排日程时调用，把它写进 macOS 提醒事项。' +
    '只在用户明确想要提醒/待办/日程时调用；普通闲聊不要调用。',
  parameters: {
    type: 'object',
    properties: {
      title: { type: 'string', description: '提醒事项内容，简洁，如「交 essay」「买牛奶」' },
      dueISO: {
        type: 'string',
        description:
          '提醒/截止时间，ISO 8601 本地时间，如 2026-06-17T09:00；只有日期就给 2026-06-17；' +
          '没有明确时间则省略。请根据系统提示里的「今天」推算「明天/下周二」等相对日期。'
      }
    },
    required: ['title']
  },
  async run(args, ctx) {
    const title = String(args.title ?? '').trim()
    if (title.length === 0) return '未提供提醒内容，已忽略'
    const dueISO = typeof args.dueISO === 'string' ? args.dueISO : undefined
    let date: Date | undefined
    if (dueISO) {
      const parsed = parseIsoDate(dueISO)
      if (parsed) {
        date = parsed.date
        if (!parsed.hasTime) date.setHours(DEFAULT_REMINDER_HOUR, 0, 0, 0)
      }
    }
    const res = await osCreateReminder({ title, date, list: ctx.reminderList, ensureList: true })
    return res.ok
      ? `已创建提醒「${title}」${date ? `，时间 ${formatDueHuman(date)}` : ''}`
      : `创建失败：${res.error}`
  }
}

const completeReminder: ToolModule = {
  name: 'complete_reminder',
  description: '当用户表示已经完成某个提醒/待办（如「essay 交了」「牛奶买好了」）时调用，把它标记完成。',
  parameters: {
    type: 'object',
    properties: {
      title: { type: 'string', description: '要标记完成的事项标题，尽量与创建时一致，如「交 essay」' }
    },
    required: ['title']
  },
  async run(args, ctx) {
    const title = String(args.title ?? '').trim()
    if (title.length === 0) return '未提供事项标题'
    const res = await osCompleteReminder(title, ctx.reminderList)
    return res.ok ? `已把「${title}」标记完成` : `操作失败：${res.error}`
  }
}

const addCountdownTool: ToolModule = {
  name: 'add_countdown',
  description:
    '当用户提到一个重要的日子时调用：考试/截止/回国等一次性倒计时，或生日/在一起纪念日等每年重复的纪念日。',
  parameters: {
    type: 'object',
    properties: {
      name: { type: 'string', description: '日子的名字，如「期末考」「回国」「在一起纪念日」' },
      date: { type: 'string', description: '日期，YYYY-MM-DD（纪念日给最初那年的日期）' },
      recurring: { type: 'boolean', description: '是否每年重复（生日/纪念日=true；考试/回国等一次性=false）' }
    },
    required: ['name', 'date']
  },
  run(args) {
    return addCountdown(String(args.name ?? '').trim(), String(args.date ?? '').trim(), Boolean(args.recurring))
  }
}

const setLocation: ToolModule = {
  name: 'set_location',
  description:
    '当用户提到自己现在在哪个城市/国家、或搬家了（如「我在马德里」「我回北京了」）时调用，' +
    '用于天气播报定位。想恢复自动定位则给空字符串。',
  parameters: {
    type: 'object',
    properties: {
      city: { type: 'string', description: '城市名，如「马德里」「New York」；留空＝按网络位置自动定位' }
    },
    required: ['city']
  },
  run(args) {
    const city = String(args.city ?? '').trim()
    saveConfig({ weatherCity: city })
    return city.length > 0 ? `已设定天气城市为「${city}」` : '已恢复为按网络位置自动定位'
  }
}

const setSupervision: ToolModule = {
  name: 'set_supervision',
  description:
    '当用户想让你别打扰（「别管我了」「静音」「今天别提醒我」）→ enabled=false；' +
    '想恢复督促（「继续监督我」「正常提醒吧」）→ enabled=true 时调用。',
  parameters: {
    type: 'object',
    properties: { enabled: { type: 'boolean', description: 'true=开启主动提醒/简报；false=全部静音' } },
    required: ['enabled']
  },
  run(args) {
    const enabled = Boolean(args.enabled)
    saveConfig({ supervisionEnabled: enabled })
    return enabled ? '已开启主动监督（提醒/简报恢复）' : '已静音所有主动提醒与简报'
  }
}

const setDailyReminder: ToolModule = {
  name: 'set_daily_reminder',
  description:
    '当用户想要「每天/每晚」定点被提醒做某事时调用（如「每天9点提醒我背单词」「以后每晚10点叫我喝水」）。' +
    '这是每日重复的关心提醒；只提醒一次的具体待办请用 create_reminder。',
  parameters: {
    type: 'object',
    properties: {
      time: { type: 'string', description: '每天提醒的时间，24 小时制 HH:MM，如 09:00、22:30' },
      message: { type: 'string', description: '提醒说的话，如「该背单词啦」「起来喝口水～」' }
    },
    required: ['time', 'message']
  },
  run(args) {
    const time = String(args.time ?? '').trim()
    const message = String(args.message ?? '').trim()
    const res = upsertDailyReminder(loadConfig().reminders, time, message)
    if (!res) return '时间格式无法识别，需要 HH:MM'
    saveConfig({ reminders: res.reminders })
    return res.updated
      ? `已把 ${res.time} 的每日提醒改为「${message}」`
      : `已设定每日提醒：${res.time}「${message}」`
  }
}

const cancelDailyReminder: ToolModule = {
  name: 'cancel_daily_reminder',
  description:
    '当用户想取消某条每日定点提醒时调用（如「别在23:30喊我睡觉了」「取消背单词的提醒」）。' +
    '可给时间或关键词来定位要取消的提醒。',
  parameters: {
    type: 'object',
    properties: {
      time: { type: 'string', description: '要取消的提醒时间 HH:MM（按时间定位时给）' },
      keyword: { type: 'string', description: '提醒内容里的关键词（按内容定位时给，如「睡觉」「背单词」）' }
    }
  },
  run(args) {
    const time = typeof args.time === 'string' ? args.time : undefined
    const keyword = typeof args.keyword === 'string' ? args.keyword : undefined
    const res = cancelDailyReminders(loadConfig().reminders, { time, keyword })
    if (res.removed > 0) {
      saveConfig({ reminders: res.reminders })
      return `已取消 ${res.removed} 条每日提醒`
    }
    return '未找到匹配的每日提醒'
  }
}

const startFocus: ToolModule = {
  name: 'start_focus',
  description:
    '当用户想开始专注/番茄钟/让你陪她学习或工作一段时间时调用（如「陪我专注25分钟」「开始番茄钟」' +
    '「学到下午3点」——按系统提示里的「现在」时间换算成分钟）。',
  parameters: {
    type: 'object',
    properties: { minutes: { type: 'number', description: '专注时长（分钟），1~120；没明说时长就用 25' } },
    required: ['minutes']
  },
  run(args, ctx) {
    const raw = Number(args.minutes)
    const mins =
      Number.isFinite(raw) && raw > 0 ? Math.min(Math.round(raw), MAX_FOCUS_MINUTES) : DEFAULT_FOCUS_MINUTES
    ctx.startFocus(mins)
    return `已开始专注 ${mins} 分钟`
  }
}

const stopFocus: ToolModule = {
  name: 'stop_focus',
  description: '当用户想停止/结束当前正在进行的专注（番茄钟）时调用，如「先停一下」「不专注了」。',
  parameters: { type: 'object', properties: {} },
  run(_args, ctx) {
    ctx.stopFocus()
    return '已停止当前专注'
  }
}

const scheduleFocus: ToolModule = {
  name: 'schedule_focus',
  description:
    '当用户想按每天/每周的固定计划自动开始专注时调用（如「每天上午9点专注2小时」「周一三五晚8点学英语1小时」）。' +
    '这是会到点自动开启番茄钟的计划；只想立刻开始一次用 start_focus。',
  parameters: {
    type: 'object',
    properties: {
      time: { type: 'string', description: '每次自动开始的时间 HH:MM，如 09:00、20:00' },
      minutes: { type: 'number', description: '专注时长（分钟），1~120' },
      days: {
        type: 'array',
        items: { type: 'number' },
        description: '星期几列表，0=周日 1=周一 … 6=周六；每天则省略或给空数组。如周一三五＝[1,3,5]'
      }
    },
    required: ['time', 'minutes']
  },
  run(args) {
    const t = normalizeTime(String(args.time ?? ''))
    if (!t) return '时间格式无法识别，需要 HH:MM'
    const rawMin = Number(args.minutes)
    const mins =
      Number.isFinite(rawMin) && rawMin > 0 ? Math.min(Math.round(rawMin), MAX_FOCUS_MINUTES) : DEFAULT_FOCUS_MINUTES
    const plan: FocusPlan = {
      id: `fp-${t.replace(':', '')}`,
      days: normalizeDays(args.days),
      time: t,
      minutes: mins,
      enabled: true
    }
    const others = loadConfig().focusPlans.filter((p) => p.time !== t)
    saveConfig({ focusPlans: [...others, plan] })
    return `已安排自动专注计划：${describePlan(plan)}`
  }
}

const cancelFocusPlan: ToolModule = {
  name: 'cancel_focus_plan',
  description: '当用户想取消某条「计划式自动专注」时调用（如「别每天9点自动专注了」）。给时间定位要取消的那条。',
  parameters: {
    type: 'object',
    properties: { time: { type: 'string', description: '要取消的计划时间 HH:MM' } }
  },
  run(args) {
    const t = normalizeTime(String(args.time ?? ''))
    const before = loadConfig().focusPlans
    const kept = t ? before.filter((p) => p.time !== t) : before
    if (kept.length < before.length) {
      saveConfig({ focusPlans: kept })
      return '已取消该自动专注计划'
    }
    return '未找到匹配的专注计划'
  }
}

const setBriefing: ToolModule = {
  name: 'set_briefing',
  description:
    '当用户想改「早安/晚安简报」的时间或开关时调用（如「早安简报改到 8 点」「晚上别播报了」' +
    '「每天 23 点跟我说晚安」）。早安简报播今日待办/天气/倒数日；晚安简报回顾今天有没有完成。',
  parameters: {
    type: 'object',
    properties: {
      which: {
        type: 'string',
        description: '改哪一个：早安简报=morning，晚安简报=evening'
      },
      time: { type: 'string', description: '简报时间，24 小时制 HH:MM，如 08:30、22:00（只调开关时可省略）' },
      enabled: { type: 'boolean', description: '开=true / 关=false（只改时间时可省略）' }
    },
    required: ['which']
  },
  run(args) {
    const which = String(args.which ?? '').trim().toLowerCase()
    if (which !== 'morning' && which !== 'evening') return '没看懂要改早安(morning)还是晚安(evening)简报呢'
    const hasTime = typeof args.time === 'string' && args.time.trim().length > 0
    const hasEnabled = typeof args.enabled === 'boolean'
    if (!hasTime && !hasEnabled) return '要改简报时间还是开关呀？给我个时间或者开/关吧'
    const cfg = loadConfig()
    const current = which === 'morning' ? cfg.morningBriefing : cfg.eveningBriefing
    let time = current.time
    if (hasTime) {
      const t = normalizeTime(String(args.time))
      if (!t) return '时间格式没看懂，需要 HH:MM（如 08:30）'
      time = t
    }
    const enabled = hasEnabled ? Boolean(args.enabled) : current.enabled
    const next = { time, enabled }
    saveConfig(which === 'morning' ? { morningBriefing: next } : { eveningBriefing: next })
    const label = which === 'morning' ? '早安简报' : '晚安简报'
    if (!enabled) return `已关掉${label}啦，需要的话随时叫我开回来～`
    return `好嘞，${label}设成每天 ${time} 啦 🐶`
  }
}

const listReminders: ToolModule = {
  name: 'list_reminders',
  description: '当用户问她有哪些待办/提醒/今天要做什么、或想回顾清单时调用，读取她的提醒清单。',
  parameters: { type: 'object', properties: {} },
  async run(_args, ctx) {
    const res = await osListReminders(ctx.reminderList)
    if (!res.ok) return `读取待办失败：${res.error}`
    return res.value.length > 0
      ? `当前待办（${res.value.length} 条）：${res.value.join('、')}`
      : '当前没有未完成的待办'
  }
}

const getWeather: ToolModule = {
  name: 'get_weather',
  description: '当用户问天气/要不要带伞/冷不冷热不热时调用，读取当前位置（或指定城市）的今日天气。',
  parameters: {
    type: 'object',
    properties: {
      city: { type: 'string', description: '可选：指定城市；不给则用她设定的城市或按网络位置自动定位' }
    }
  },
  async run(args) {
    const city = String(args.city ?? '').trim() || loadConfig().weatherCity
    const line = await weatherLine(city)
    return line ?? '暂时获取不到天气（可能没联网或定位失败）'
  }
}

/** 线条小狗的生活类工具集（注册顺序即对模型暴露的顺序，与重构前 PET_TOOLS 一致）。 */
export const PET_TOOL_MODULES: ToolModule[] = [
  createReminder,
  completeReminder,
  addCountdownTool,
  setLocation,
  setSupervision,
  setDailyReminder,
  cancelDailyReminder,
  startFocus,
  stopFocus,
  scheduleFocus,
  cancelFocusPlan,
  setBriefing,
  listReminders,
  getWeather
]

/** 兼容旧用法：对模型暴露的 Tool[] 定义（runChat 的 tools 参数 / 场景测试用）。 */
export const PET_TOOLS = PET_TOOL_MODULES.map(toToolDef)
