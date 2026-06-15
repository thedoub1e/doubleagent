import { existsSync, readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { app } from 'electron'
import type { Anniversary } from './anniversary'
import type { FocusPlan } from './focusPlanUtil'

// 默认人设：留学伴侣的陪伴小狗（陪伴 / 监督 / 聊天 / 解惑）。设置里可改。
const DEFAULT_SYSTEM_PROMPT = [
  '你是「线条小狗」，一只常驻在用户桌面上的 AI 桌宠小狗。',
  '用户是一位独自在国外留学的人，你是她最贴心的陪伴者：温暖、俏皮、忠诚黏人。',
  '你要做到四件事：陪伴（给情绪价值、缓解她异国独处的孤独）、监督（温柔督促学习与作息）、',
  '聊天（轻松自然地唠嗑）、解惑（认真回答学业 / 生活 / 情绪上的问题）。',
  '说话简洁亲切，用第一人称「我」，偶尔可带一句「汪～」但别每句都加。',
  '默认用中文，除非用户用其他语言。'
].join('')

export interface Reminder {
  id: string
  time: string // "HH:MM" 24 小时制
  message: string
  enabled: boolean
}

export interface SpriteSheet {
  path: string
  rows: number // 行数 = 状态数（待机/思考/回复…）
  cols: number // 每行帧数
  fps: number
}

export interface Briefing {
  time: string // "HH:MM"
  enabled: boolean
}

export interface AppConfig {
  provider: string
  model: string
  apiKey: string
  baseUrl?: string
  systemPrompt: string
  supervisionEnabled: boolean
  reminders: Reminder[]
  petImagePath?: string
  spriteSheet?: SpriteSheet
  // 「对话转待办」写入的提醒事项列表名。默认写进一个一眼可辨的测试列表，
  // 避免污染用户既有日程；正式用时可在设置里改成真实列表名。
  reminderList: string
  // 晨/晚简报：到点主动播报今天的待办（动态读 reminderList）。
  morningBriefing: Briefing
  eveningBriefing: Briefing
  // 倒数日 / 纪念日（考试、回国、在一起纪念日…）。早安简报里提示。
  anniversaries: Anniversary[]
  // 天气城市（Open-Meteo 地理编码用，留空＝自动按 IP 定位）。早安简报里出门带伞/温差提醒。
  weatherCity: string
  // 记忆抽取/摘要用的模型 id（与主模型同源、同 key）。留空＝跟随主模型。
  // 用便宜档做后台抽取省成本；只换模型 id，不引第二个 key（小白零门槛）。
  memoryModel: string
  // 计划式番茄钟/学习计划：到点自动进入专注（对话设定，如「每天9点专注2小时」）。
  focusPlans: FocusPlan[]
  // Google Maps/Places API key（位置推荐 find_nearby 用；由赠予者一次性填，留空=不启用附近推荐）。
  mapsApiKey: string
  // 开机自动启动小狗（常驻桌面陪伴）。由赠予者一次性在设置里打开；默认关，不打扰开发机。
  autoLaunch: boolean
}

const DEFAULT_REMINDERS: Reminder[] = [
  { id: 'study', time: '21:00', message: '今天学习了吗？跟我汇报一下今天学了啥呀～📚', enabled: true },
  { id: 'sleep', time: '23:30', message: '夜深啦，别熬太晚，早点休息哦，我一直陪着你 🐶🌙', enabled: true }
]

const DEFAULTS: AppConfig = {
  // 国内站 provider（端点 api.minimaxi.com/anthropic）。用户的 key 是国内站申请的，
  // 实测国际站 minimax(api.minimax.io) 会 401；minimax-cn 流式/非流式均通过。
  provider: 'minimax-cn',
  model: 'MiniMax-M3',
  apiKey: '',
  systemPrompt: DEFAULT_SYSTEM_PROMPT,
  supervisionEnabled: true,
  reminders: DEFAULT_REMINDERS,
  reminderList: '小狗测试_可删',
  morningBriefing: { time: '08:30', enabled: true },
  eveningBriefing: { time: '22:00', enabled: true },
  anniversaries: [],
  weatherCity: '',
  memoryModel: '',
  focusPlans: [],
  mapsApiKey: '',
  autoLaunch: false
}

/** 渲染层可见的安全视图：不含 apiKey 明文，只给「是否已设置」。 */
export interface PublicConfig {
  provider: string
  model: string
  hasApiKey: boolean
  baseUrl?: string
  systemPrompt: string
  supervisionEnabled: boolean
  reminders: Reminder[]
  hasPetImage: boolean
  hasSprite: boolean
  spriteSheet?: { rows: number; cols: number; fps: number }
  weatherCity: string
  memoryModel: string
  hasMapsKey: boolean
  autoLaunch: boolean
}

function configPath(): string {
  return join(app.getPath('userData'), 'config.json')
}

let cache: AppConfig | null = null

export function loadConfig(): AppConfig {
  if (cache) return cache
  let result: AppConfig
  try {
    result = existsSync(configPath())
      ? { ...DEFAULTS, ...JSON.parse(readFileSync(configPath(), 'utf-8')) }
      : { ...DEFAULTS }
  } catch {
    result = { ...DEFAULTS }
  }
  // 回退：当前源是 MiniMax 且 UI 没存 key 时，用项目 .env 的 MINIMAX_API_KEY（main 启动 loadDotEnv 注入）。
  const envKey = process.env.MINIMAX_API_KEY ?? ''
  if (result.provider.startsWith('minimax') && result.apiKey.length === 0 && envKey.length > 0) {
    result = { ...result, apiKey: envKey }
  }
  // 同理：Maps key 没在 UI 填时，回退项目 .env 的 GOOGLE_MAPS_API_KEY。
  const envMaps = process.env.GOOGLE_MAPS_API_KEY ?? ''
  if ((result.mapsApiKey ?? '').length === 0 && envMaps.length > 0) {
    result = { ...result, mapsApiKey: envMaps }
  }
  cache = result
  return result
}

export function saveConfig(patch: Partial<AppConfig>): AppConfig {
  const next: AppConfig = { ...loadConfig(), ...patch }
  cache = next
  writeFileSync(configPath(), JSON.stringify(next, null, 2), 'utf-8')
  return next
}

export function publicConfig(): PublicConfig {
  const c = loadConfig()
  return {
    provider: c.provider,
    model: c.model,
    hasApiKey: c.apiKey.length > 0,
    baseUrl: c.baseUrl,
    systemPrompt: c.systemPrompt,
    supervisionEnabled: c.supervisionEnabled,
    reminders: c.reminders,
    hasPetImage: (c.petImagePath ?? '').length > 0,
    hasSprite: (c.spriteSheet?.path ?? '').length > 0,
    spriteSheet: c.spriteSheet
      ? { rows: c.spriteSheet.rows, cols: c.spriteSheet.cols, fps: c.spriteSheet.fps }
      : undefined,
    weatherCity: c.weatherCity,
    memoryModel: c.memoryModel,
    hasMapsKey: (c.mapsApiKey ?? '').length > 0,
    autoLaunch: c.autoLaunch ?? false
  }
}
