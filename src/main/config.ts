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

export interface AppConfig {
  provider: string
  model: string
  apiKey: string
  baseUrl?: string
  systemPrompt: string
}

const DEFAULTS: AppConfig = {
  // 国内站 provider（端点 api.minimaxi.com/anthropic）。用户的 key 是国内站申请的，
  // 实测国际站 minimax(api.minimax.io) 会 401；minimax-cn 流式/非流式均通过。
  provider: 'minimax-cn',
  model: 'MiniMax-M3',
  apiKey: '',
  systemPrompt: DEFAULT_SYSTEM_PROMPT
}

/** 渲染层可见的安全视图：不含 apiKey 明文，只给「是否已设置」。 */
export interface PublicConfig {
  provider: string
  model: string
  hasApiKey: boolean
  baseUrl?: string
  systemPrompt: string
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
  // 回退：UI 没存 key 时，用项目 .env 的 MINIMAX_API_KEY（由 main 启动时 loadDotEnv 注入）。
  if (result.apiKey.length === 0 && (process.env.MINIMAX_API_KEY ?? '').length > 0) {
    result = { ...result, apiKey: process.env.MINIMAX_API_KEY as string }
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
    systemPrompt: c.systemPrompt
  }
}
