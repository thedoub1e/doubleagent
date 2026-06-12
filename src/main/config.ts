import { existsSync, readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { app } from 'electron'

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

export interface AppConfig {
  provider: string
  model: string
  apiKey: string
  baseUrl?: string
  systemPrompt: string
  supervisionEnabled: boolean
  reminders: Reminder[]
  petImagePath?: string
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
  reminders: DEFAULT_REMINDERS
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
    hasPetImage: (c.petImagePath ?? '').length > 0
  }
}
