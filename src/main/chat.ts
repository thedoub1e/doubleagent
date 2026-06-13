import type { Tool, ToolCall } from '@earendil-works/pi-ai'
import type { AppConfig } from './config'
import type { FactCategory, FactType, ProfileFact, ProfileOp } from './profileUtil'
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
  /** 模型发起工具调用时回调（由调用方执行工具并返回给用户看的「人话回执」）。 */
  onToolCalls?: (calls: ToolCall[]) => Promise<string>
}

// 工具参数用「纯 JSON Schema 对象」声明，不静态 import pi-ai 的 TypeBox `Type`：
// pi-ai 只导出 ESM "import" 条件，在 Electron 主进程(CJS)里静态值导入会 ERR_PACKAGE_PATH_NOT_EXPORTED
// （动态 import() 才行）。而 TypeBox 的 Type.Object(...) 运行时本就序列化成等价 JSON Schema，
// 手写纯对象发给模型完全一致。`import type { Tool }` 是类型导入、编译期擦除，无运行时依赖。
interface JsonSchema {
  type: 'object'
  properties: Record<string, { type: string; description?: string }>
  required?: string[]
}
function defineTool(name: string, description: string, parameters: JsonSchema): Tool {
  return { name, description, parameters } as unknown as Tool
}

/** 「对话转待办」工具：让模型在用户想被提醒时把事项写进 macOS 提醒事项。
 *  仅注册这一个安全工具；模型只填参数，AppleScript 模板由我们写死（绝不执行模型给的脚本）。 */
export const createReminderTool: Tool = defineTool(
  'create_reminder',
  '当用户想被提醒做某事、记一个待办或安排日程时调用，把它写进 macOS 提醒事项。' +
    '只在用户明确想要提醒/待办/日程时调用；普通闲聊不要调用。',
  {
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
  }
)

/** 「完成核销」工具：用户说做完了某事时，把对应提醒标记完成（闭环跟进的收尾）。 */
export const completeReminderTool: Tool = defineTool(
  'complete_reminder',
  '当用户表示已经完成某个提醒/待办（如「essay 交了」「牛奶买好了」）时调用，把它标记完成。',
  {
    type: 'object',
    properties: {
      title: { type: 'string', description: '要标记完成的事项标题，尽量与创建时一致，如「交 essay」' }
    },
    required: ['title']
  }
)

/** 「倒数日/纪念日」工具：用户提到重要日子时记下，早安简报里倒计时/庆祝。 */
export const addCountdownTool: Tool = defineTool(
  'add_countdown',
  '当用户提到一个重要的日子时调用：考试/截止/回国等一次性倒计时，或生日/在一起纪念日等每年重复的纪念日。',
  {
    type: 'object',
    properties: {
      name: { type: 'string', description: '日子的名字，如「期末考」「回国」「在一起纪念日」' },
      date: { type: 'string', description: '日期，YYYY-MM-DD（纪念日给最初那年的日期）' },
      recurring: {
        type: 'boolean',
        description: '是否每年重复（生日/纪念日=true；考试/回国等一次性=false）'
      }
    },
    required: ['name', 'date']
  }
)

/** 注册给模型的工具集合（仅安全工具：建提醒 / 核销 / 倒数日）。 */
export const PET_TOOLS: Tool[] = [createReminderTool, completeReminderTool, addCountdownTool]

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
  handlers: StreamHandlers,
  tools?: Tool[]
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
    messages: recent.map((m) => ({ role: m.role, content: m.content })),
    ...(tools && tools.length > 0 ? { tools } : {})
  }

  let full = ''
  const toolCalls: ToolCall[] = []
  try {
    handlers.onStart()
    const s = pi.stream(model as never, context as never, {
      apiKey: config.apiKey,
      signal: controller.signal
    } as never)

    for await (const event of s as AsyncIterable<{
      type: string
      delta?: string
      error?: unknown
      toolCall?: ToolCall
    }>) {
      if (event.type === 'text_delta' && typeof event.delta === 'string') {
        full += event.delta
        handlers.onDelta(event.delta)
      } else if (event.type === 'toolcall_end' && event.toolCall) {
        toolCalls.push(event.toolCall)
      } else if (event.type === 'error') {
        handlers.onError(String(event.error))
        return
      }
    }

    // 有工具调用：交调用方执行 → 把「人话回执」补进聊天（不二次调模型，确定性 + 省 token）。
    if (toolCalls.length > 0 && handlers.onToolCalls) {
      const receipt = await handlers.onToolCalls(toolCalls)
      if (receipt.length > 0) handlers.onDelta(receipt)
      handlers.onDone(full.length > 0 ? `${full}\n\n${receipt}` : receipt)
    } else {
      handlers.onDone(full)
    }
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

/** 主动找话题：让模型以人设口吻主动开一句口（非流式）。systemPrompt 由调用方注入(人设+记忆+画像)。
 *  失败 / 没填 key 返回 null（调用方退回兜底文案）。 */
export async function composeOpener(recent: ChatMessage[], config: AppConfig): Promise<string | null> {
  if (config.apiKey.length === 0) return null
  const built = await buildModel(config)
  if ('error' in built) return null
  const { pi, model } = built

  const recentMsgs = recent.slice(-6).map((m) => ({ role: m.role, content: m.content }))
  const context = {
    systemPrompt:
      config.systemPrompt +
      '\n\n【现在】用户已经有一段时间没和你说话了。请你主动、温柔地开口找她说一句：' +
      '可以是关心她、说想她了、或抛一个轻松的小话题。1~2 句，自然亲切、符合你的人设，' +
      '别像客服、别重复老套开场白。直接说那句话本身，不要加任何前缀或解释。',
    messages:
      recentMsgs.length > 0
        ? recentMsgs
        : [{ role: 'user' as const, content: '（我们还没怎么聊过，主动跟我打个招呼吧）' }]
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

const VALID_CATEGORIES: FactCategory[] = ['identity', 'preference', 'concern', 'commitment', 'trait']
const VALID_FACT_TYPES: FactType[] = ['world', 'experience', 'opinion']

/** 从模型返回文本里容错抽出 JSON ops 数组并校验（信号门控：无新信息 → 模型给 [] → 返回 []）。 */
function parseProfileOps(text: string): ProfileOp[] {
  const start = text.indexOf('[')
  const end = text.lastIndexOf(']')
  if (start === -1 || end === -1 || end < start) return []
  let arr: unknown
  try {
    arr = JSON.parse(text.slice(start, end + 1))
  } catch {
    return []
  }
  if (!Array.isArray(arr)) return []
  const ops: ProfileOp[] = []
  for (const item of arr) {
    if (!item || typeof item !== 'object') continue
    const o = item as Record<string, unknown>
    const content = typeof o.content === 'string' ? o.content.trim() : undefined
    const factType = VALID_FACT_TYPES.includes(o.factType as FactType)
      ? (o.factType as FactType)
      : undefined
    const confidence = typeof o.confidence === 'number' ? o.confidence : undefined
    if (o.op === 'ADD' && content && VALID_CATEGORIES.includes(o.category as FactCategory)) {
      ops.push({
        op: 'ADD',
        category: o.category as FactCategory,
        content,
        inferred: Boolean(o.inferred),
        factType: factType ?? 'world',
        confidence,
        constant: Boolean(o.constant) || undefined
      })
    } else if (o.op === 'UPDATE' && typeof o.id === 'string') {
      ops.push({
        op: 'UPDATE',
        id: o.id,
        content,
        category: VALID_CATEGORIES.includes(o.category as FactCategory)
          ? (o.category as FactCategory)
          : undefined,
        inferred: typeof o.inferred === 'boolean' ? o.inferred : undefined,
        factType,
        confidence
      })
    } else if (o.op === 'DELETE' && typeof o.id === 'string') {
      ops.push({ op: 'DELETE', id: o.id })
    }
  }
  return ops
}

/** 从最近一轮对话增量抽取画像操作（非流式、信号门控）。失败/无新信息返回 []。 */
export async function extractProfile(
  recent: ChatMessage[],
  existing: ProfileFact[],
  config: AppConfig
): Promise<ProfileOp[]> {
  if (config.apiKey.length === 0) return []
  const built = await buildModel(config)
  if ('error' in built) return []
  const { pi, model } = built

  const factsText =
    existing.length > 0
      ? existing.map((f) => `[${f.id}] (${f.category}) ${f.content}`).join('\n')
      : '（暂无）'
  const convo = recent
    .map((m) => `${m.role === 'user' ? '用户' : '小狗'}：${m.content}`)
    .join('\n')

  const context = {
    systemPrompt:
      '你在维护对用户的结构化画像。只从对话里抽取关于「用户」的、值得长期记住的新信息，' +
      '输出一个 JSON 数组，每个元素是一次操作：\n' +
      '- {"op":"ADD","category":..,"content":"..","inferred":bool,"factType":"world|experience|opinion","confidence":0~1}\n' +
      '- {"op":"UPDATE","id":"已有事实id","content":".."}（信息变化/纠正时；矛盾也用 UPDATE 覆盖，别新增重复）\n' +
      '- {"op":"DELETE","id":"已有事实id"}（仅当用户明确要求忘记某事）\n' +
      'category 取值：identity(身份)/preference(喜好)/concern(在意的事)/commitment(约定)/trait(性格)。' +
      '性格/情绪/作息这类推断设 inferred=true、给较低 confidence。' +
      '关键安全/健康事实（如过敏）可设 "constant":true。' +
      '**没有值得记的新信息时，输出空数组 []**。闲聊/寒暄不要记。只输出 JSON 数组，不要其它文字。',
    messages: [
      {
        role: 'user',
        content: `已有画像事实：\n${factsText}\n\n最近对话：\n${convo}\n\n请输出操作 JSON 数组：`
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
    return parseProfileOps(text)
  } catch {
    return []
  }
}
