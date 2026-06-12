import type { AppConfig } from './config'
import { findPreset } from '../shared/providers'

// 历史里只存纯文本（便于持久化 / 渲染）；调用模型时再转成 pi-ai 的 Context。
export interface ChatMessage {
  role: 'user' | 'assistant'
  content: string
}

export interface StreamHandlers {
  onStart: () => void
  onDelta: (delta: string) => void
  onDone: (fullText: string) => void
  onError: (message: string) => void
}

// 送进模型的上下文最多保留最近 N 条，控制 token 成本（完整历史另存于 history）。
const MAX_CONTEXT_MESSAGES = 30

let currentController: AbortController | null = null

type Pi = typeof import('@earendil-works/pi-ai')

// 解析出可调用的 model：native 走 pi 内置 provider；自定义源自建 OpenAI 兼容 Model。
async function buildModel(
  config: AppConfig
): Promise<{ pi: Pi; model: unknown } | { error: string }> {
  const pi = await import('@earendil-works/pi-ai')
  const preset = findPreset(config.provider)
  if (!preset) return { error: `未知的模型源：${config.provider}` }
  try {
    if (preset.kind === 'pi') {
      return { pi, model: pi.getModel(preset.piProvider as never, config.model as never) }
    }
    const baseUrl = (config.baseUrl ?? '').length > 0 ? config.baseUrl : preset.defaultBaseUrl
    if (!baseUrl) return { error: '这个源需要在设置里填 baseURL（接口地址）。' }
    return {
      pi,
      model: {
        id: config.model,
        name: config.model,
        api: 'openai-completions',
        provider: preset.id,
        baseUrl,
        reasoning: false,
        input: ['text'],
        cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 },
        contextWindow: 128000,
        maxTokens: 8192
      }
    }
  } catch (e) {
    return { error: `模型不可用：${(e as Error).message}` }
  }
}

/**
 * 用 pi-ai 流式跑一轮对话。pi-ai 在主进程运行（key 不进渲染层）。
 * 动态 import 以规避 ESM/CJS 互操作问题。
 */
export async function runChat(
  history: ChatMessage[],
  config: AppConfig,
  handlers: StreamHandlers
): Promise<void> {
  if (config.apiKey.length === 0) {
    handlers.onError('还没填 API Key —— 点设置，粘贴你的 Key。')
    return
  }

  const built = await buildModel(config)
  if ('error' in built) {
    handlers.onError(built.error)
    return
  }
  const { pi, model } = built

  const controller = new AbortController()
  currentController = controller

  const recent = history.slice(-MAX_CONTEXT_MESSAGES)
  const context = {
    systemPrompt: config.systemPrompt,
    messages: recent.map((m) => ({ role: m.role, content: m.content }))
  }

  let full = ''
  try {
    handlers.onStart()
    const s = pi.stream(model as never, context as never, {
      apiKey: config.apiKey,
      signal: controller.signal
    } as never)

    for await (const event of s as AsyncIterable<{ type: string; delta?: string; error?: unknown }>) {
      if (event.type === 'text_delta' && typeof event.delta === 'string') {
        full += event.delta
        handlers.onDelta(event.delta)
      } else if (event.type === 'error') {
        handlers.onError(String(event.error))
        return
      }
    }
    handlers.onDone(full)
  } catch (e) {
    if (controller.signal.aborted) {
      handlers.onDone(full)
    } else {
      handlers.onError((e as Error)?.message ?? String(e))
    }
  } finally {
    if (currentController === controller) currentController = null
  }
}

export function abortChat(): void {
  currentController?.abort()
}

interface CompletionResult {
  content?: Array<{ type: string; text?: string }>
}

/** 把一段对话 + 已有摘要融合成更新后的长期记忆摘要（非流式）。失败返回 null。 */
export async function summarizeConversation(
  messages: ChatMessage[],
  prevSummary: string,
  config: AppConfig
): Promise<string | null> {
  if (config.apiKey.length === 0) return null
  const built = await buildModel(config)
  if ('error' in built) return null
  const { pi, model } = built

  const convo = messages
    .map((m) => `${m.role === 'user' ? '用户' : '小狗'}：${m.content}`)
    .join('\n')
  const context = {
    systemPrompt:
      '你在维护对用户的长期记忆。把已有记忆与新对话融合，输出一段简洁中文摘要：' +
      '记录用户的身份/喜好/正在发生的事/关心的点/约定，去掉寒暄与无信息内容。只输出摘要本身。',
    messages: [
      {
        role: 'user',
        content: `已有记忆：\n${prevSummary || '（无）'}\n\n新对话：\n${convo}\n\n请输出更新后的记忆摘要：`
      }
    ]
  }
  try {
    const res = (await pi.complete(model as never, context as never, {
      apiKey: config.apiKey
    } as never)) as CompletionResult
    const text = (res.content ?? [])
      .filter((b) => b.type === 'text')
      .map((b) => b.text ?? '')
      .join('')
      .trim()
    return text.length > 0 ? text : null
  } catch {
    return null
  }
}
