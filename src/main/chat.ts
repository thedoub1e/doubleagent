import type { AppConfig } from './config'

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
    handlers.onError('还没填 API Key —— 点设置，粘贴你的 MiniMax Key。')
    return
  }

  const pi = await import('@earendil-works/pi-ai')

  let model: ReturnType<typeof pi.getModel>
  try {
    model = pi.getModel(config.provider as never, config.model as never)
  } catch (e) {
    handlers.onError(`模型不可用：${(e as Error).message}`)
    return
  }

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
    const s = pi.stream(model, context as never, {
      apiKey: config.apiKey,
      baseUrl: config.baseUrl,
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
