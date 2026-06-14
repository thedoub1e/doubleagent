import type { Tool, ToolCall } from '@earendil-works/pi-ai'
import type { AppConfig } from './config'
import type { FactCategory, FactType, ProfileFact, ProfileOp } from './profileUtil'
import { findPreset } from '../shared/providers'

// 历史里只存纯文本（便于持久化 / 渲染）；调用模型时再转成 pi-ai 的 Context。
export interface ChatMessage {
  role: 'user' | 'assistant'
  content: string
}

/** 一次工具执行的结果，回喂给模型（多轮 agent 循环）。 */
export interface ToolResult {
  toolCallId: string
  toolName: string
  text: string
}

export interface StreamHandlers {
  onStart: () => void
  onDelta: (delta: string) => void
  onDone: (fullText: string) => void
  onError: (message: string) => void
  /** 模型发起工具调用时回调：调用方执行工具，返回每个调用的结果（回喂模型继续）。 */
  onToolCalls?: (calls: ToolCall[]) => Promise<ToolResult[]>
}

// 工具参数用「纯 JSON Schema 对象」声明，不静态 import pi-ai 的 TypeBox `Type`：
// pi-ai 只导出 ESM "import" 条件，在 Electron 主进程(CJS)里静态值导入会 ERR_PACKAGE_PATH_NOT_EXPORTED
// （动态 import() 才行）。而 TypeBox 的 Type.Object(...) 运行时本就序列化成等价 JSON Schema，
// 手写纯对象发给模型完全一致。`import type { Tool }` 是类型导入、编译期擦除，无运行时依赖。
interface JsonSchemaProp {
  type: string
  description?: string
  items?: { type: string }
}
interface JsonSchema {
  type: 'object'
  properties: Record<string, JsonSchemaProp>
  required?: string[]
}
function defineTool(name: string, description: string, parameters: JsonSchema): Tool {
  return { name, description, parameters } as unknown as Tool
}

/** 把任意错误(字符串/Error/带 message 的对象/纯对象)安全转成可读文案，绝不产出 "[object Object]"。 */
function errToText(err: unknown): string {
  if (typeof err === 'string') return err
  if (err instanceof Error) return err.message
  if (err && typeof err === 'object') {
    const o = err as Record<string, unknown>
    if (typeof o.message === 'string') return o.message
    if (typeof o.error === 'string') return o.error
    try {
      return JSON.stringify(err)
    } catch {
      return '未知错误'
    }
  }
  return String(err ?? '未知错误')
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

/** 「设定位置」工具：用户提到自己在哪/搬到哪 → 设天气播报城市（留空＝按 IP 自动）。 */
export const setLocationTool: Tool = defineTool(
  'set_location',
  '当用户提到自己现在在哪个城市/国家、或搬家了（如「我在马德里」「我回北京了」）时调用，' +
    '用于天气播报定位。想恢复自动定位则给空字符串。',
  {
    type: 'object',
    properties: {
      city: { type: 'string', description: '城市名，如「马德里」「New York」；留空＝按网络位置自动定位' }
    },
    required: ['city']
  }
)

/** 「主动监督开关」工具：用户想清静/想被督促时切换所有主动提醒与简报。 */
export const setSupervisionTool: Tool = defineTool(
  'set_supervision',
  '当用户想让你别打扰（「别管我了」「静音」「今天别提醒我」）→ enabled=false；' +
    '想恢复督促（「继续监督我」「正常提醒吧」）→ enabled=true 时调用。',
  {
    type: 'object',
    properties: {
      enabled: { type: 'boolean', description: 'true=开启主动提醒/简报；false=全部静音' }
    },
    required: ['enabled']
  }
)

/** 「设定每日提醒」工具：用户想每天定点被提醒做某事（区别于一次性的 create_reminder）。 */
export const setDailyReminderTool: Tool = defineTool(
  'set_daily_reminder',
  '当用户想要「每天/每晚」定点被提醒做某事时调用（如「每天9点提醒我背单词」「以后每晚10点叫我喝水」）。' +
    '这是每日重复的关心提醒；只提醒一次的具体待办请用 create_reminder。',
  {
    type: 'object',
    properties: {
      time: { type: 'string', description: '每天提醒的时间，24 小时制 HH:MM，如 09:00、22:30' },
      message: { type: 'string', description: '提醒说的话，如「该背单词啦」「起来喝口水～」' }
    },
    required: ['time', 'message']
  }
)

/** 「取消每日提醒」工具：用户不想再被某条每日提醒打扰时。 */
export const cancelDailyReminderTool: Tool = defineTool(
  'cancel_daily_reminder',
  '当用户想取消某条每日定点提醒时调用（如「别在23:30喊我睡觉了」「取消背单词的提醒」）。' +
    '可给时间或关键词来定位要取消的提醒。',
  {
    type: 'object',
    properties: {
      time: { type: 'string', description: '要取消的提醒时间 HH:MM（按时间定位时给）' },
      keyword: { type: 'string', description: '提醒内容里的关键词（按内容定位时给，如「睡觉」「背单词」）' }
    }
  }
)

/** 「开始专注」工具：用户想用番茄钟专注/被陪学一段时间时启动计时。 */
export const startFocusTool: Tool = defineTool(
  'start_focus',
  '当用户想开始专注/番茄钟/让你陪她学习或工作一段时间时调用（如「陪我专注25分钟」「开始番茄钟」' +
    '「学到下午3点」——按系统提示里的「现在」时间换算成分钟）。',
  {
    type: 'object',
    properties: {
      minutes: { type: 'number', description: '专注时长（分钟），1~120；没明说时长就用 25' }
    },
    required: ['minutes']
  }
)

/** 「停止专注」工具：用户想中断当前番茄钟时。 */
export const stopFocusTool: Tool = defineTool(
  'stop_focus',
  '当用户想停止/结束当前正在进行的专注（番茄钟）时调用，如「先停一下」「不专注了」。',
  { type: 'object', properties: {} }
)

/** 「计划专注」工具：用户有清晰的每天/每周学习计划，想到点自动进入专注时。 */
export const scheduleFocusTool: Tool = defineTool(
  'schedule_focus',
  '当用户想按每天/每周的固定计划自动开始专注时调用（如「每天上午9点专注2小时」「周一三五晚8点学英语1小时」）。' +
    '这是会到点自动开启番茄钟的计划；只想立刻开始一次用 start_focus。',
  {
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
  }
)

/** 「取消专注计划」工具。 */
export const cancelFocusPlanTool: Tool = defineTool(
  'cancel_focus_plan',
  '当用户想取消某条「计划式自动专注」时调用（如「别每天9点自动专注了」）。给时间定位要取消的那条。',
  {
    type: 'object',
    properties: {
      time: { type: 'string', description: '要取消的计划时间 HH:MM' }
    }
  }
)

/** 「查看待办」工具（读取型）：用户问她有哪些待办/今天要做什么时。 */
export const listRemindersTool: Tool = defineTool(
  'list_reminders',
  '当用户问她有哪些待办/提醒/今天要做什么、或想回顾清单时调用，读取她的提醒清单。',
  { type: 'object', properties: {} }
)

/** 「查天气」工具（读取型）：用户问天气/要不要带伞/冷不冷时。 */
export const getWeatherTool: Tool = defineTool(
  'get_weather',
  '当用户问天气/要不要带伞/冷不冷热不热时调用，读取当前位置（或指定城市）的今日天气。',
  {
    type: 'object',
    properties: {
      city: { type: 'string', description: '可选：指定城市；不给则用她设定的城市或按网络位置自动定位' }
    }
  }
)

/** 注册给模型的工具集合（仅安全工具：本机提醒/倒数日/对话配置/番茄钟/查询；绝不引 file/bash）。 */
export const PET_TOOLS: Tool[] = [
  createReminderTool,
  completeReminderTool,
  addCountdownTool,
  setLocationTool,
  setSupervisionTool,
  setDailyReminderTool,
  cancelDailyReminderTool,
  startFocusTool,
  stopFocusTool,
  scheduleFocusTool,
  cancelFocusPlanTool,
  listRemindersTool,
  getWeatherTool
]

// 送进模型的上下文最多保留最近 N 条，控制 token 成本（完整历史另存于 history）。
const MAX_CONTEXT_MESSAGES = 30
// agent 多轮工具循环的安全上限：防止模型无限调工具。
const MAX_TOOL_ROUNDS = 5

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
        input: preset.vision ? ['text', 'image'] : ['text'],
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
/** 当前配置的模型是否支持看图（读 pi-ai 的 model.input 模态，权威）。 */
export async function modelSupportsImages(config: AppConfig): Promise<boolean> {
  const built = await buildModel(config)
  if ('error' in built) return false
  const input = (built.model as { input?: unknown }).input
  return Array.isArray(input) && input.includes('image')
}

/** dataURL → pi-ai ImageContent（剥掉 data: 前缀，拆出 mimeType 与 base64）。 */
function parseImageDataUrl(url: string): { type: 'image'; data: string; mimeType: string } | null {
  const m = /^data:([^;]+);base64,(.+)$/s.exec(url)
  if (!m) return null
  return { type: 'image', data: m[2], mimeType: m[1] }
}

export async function runChat(
  history: ChatMessage[],
  config: AppConfig,
  handlers: StreamHandlers,
  tools?: Tool[],
  images: string[] = []
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
  // pi-ai 的 Message 数组；多轮里会追加 assistant 消息与 toolResult 消息。
  const messages: unknown[] = recent.map((m) => ({
    role: m.role,
    content: m.content,
    timestamp: 0
  }))
  // 当前轮带图：把图片附到最后一条 user 消息（content 变成 文本+图片 的多模态数组）。
  const imgParts = images.map(parseImageDataUrl).filter((p): p is { type: 'image'; data: string; mimeType: string } => p !== null)
  if (imgParts.length > 0 && messages.length > 0) {
    const last = messages[messages.length - 1] as { role: string; content: string }
    if (last.role === 'user') {
      messages[messages.length - 1] = {
        ...last,
        content: [{ type: 'text', text: last.content }, ...imgParts]
      }
    }
  }

  let full = ''
  try {
    handlers.onStart()

    // 多轮 agent 循环：模型调工具 → 执行 → 结果回喂 → 再问，直到不再调工具（或到上限）。
    for (let round = 0; round < MAX_TOOL_ROUNDS; round++) {
      const context = {
        systemPrompt: config.systemPrompt,
        messages,
        ...(tools && tools.length > 0 ? { tools } : {})
      }
      const s = pi.stream(model as never, context as never, {
        apiKey: config.apiKey,
        signal: controller.signal
      } as never)

      const roundToolCalls: ToolCall[] = []
      let assistantMsg: unknown = null
      for await (const event of s as AsyncIterable<{
        type: string
        delta?: string
        error?: unknown
        toolCall?: ToolCall
        message?: unknown
      }>) {
        if (event.type === 'text_delta' && typeof event.delta === 'string') {
          full += event.delta
          handlers.onDelta(event.delta)
        } else if (event.type === 'toolcall_end' && event.toolCall) {
          roundToolCalls.push(event.toolCall)
        } else if (event.type === 'done') {
          assistantMsg = event.message
        } else if (event.type === 'error') {
          handlers.onError(errToText(event.error))
          return
        }
      }

      // 没有工具调用 → 本轮就是最终回复，结束循环。
      if (roundToolCalls.length === 0 || !handlers.onToolCalls) break

      // 回放：把模型这轮的 assistant 消息（含 toolCall）原样追加，再追加各工具结果。
      if (assistantMsg) messages.push(assistantMsg)
      const results = await handlers.onToolCalls(roundToolCalls)
      for (const r of results) {
        messages.push({
          role: 'toolResult',
          toolCallId: r.toolCallId,
          toolName: r.toolName,
          content: [{ type: 'text', text: r.text }],
          isError: false,
          timestamp: 0
        })
      }
      // 继续下一轮：模型据工具结果组织最终语言（读取型工具如查天气/待办在此生效）。
    }

    handlers.onDone(full)
  } catch (e) {
    if (controller.signal.aborted) {
      handlers.onDone(full)
    } else {
      handlers.onError(errToText(e))
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

/** 后台记忆任务（抽取/摘要）用的配置：同源、同 key，仅在设了 memoryModel 时换模型 id（省成本）。 */
function memoryConfig(config: AppConfig): AppConfig {
  return config.memoryModel.length > 0 ? { ...config, model: config.memoryModel } : config
}

/** 把一段对话 + 已有摘要融合成更新后的长期记忆摘要（非流式）。失败返回 null。 */
export async function summarizeConversation(
  messages: ChatMessage[],
  prevSummary: string,
  config: AppConfig
): Promise<string | null> {
  if (config.apiKey.length === 0) return null
  const built = await buildModel(memoryConfig(config))
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

/** 给一段对话起一个简短的「总结式」标题（4~12 字，像 ChatGPT 会话名）。失败返回 null。非流式、用便宜模型。 */
export async function composeTitle(recent: ChatMessage[], config: AppConfig): Promise<string | null> {
  if (config.apiKey.length === 0) return null
  const built = await buildModel(memoryConfig(config))
  if ('error' in built) return null
  const { pi, model } = built

  const convo = recent
    .slice(-6)
    .map((m) => `${m.role === 'user' ? '用户' : '小狗'}：${m.content}`)
    .join('\n')
  const context = {
    systemPrompt:
      '给下面这段对话起一个简短的中文标题，概括主题，4~12 个字，' +
      '像聊天软件的会话名（如「花生过敏」「期末复习计划」「周末出游」）。' +
      '不要标点、不要引号、不要前后缀，只输出标题本身。',
    messages: [{ role: 'user', content: `对话：\n${convo}\n\n标题：` }]
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
      .replace(/^["'「『]|["'」』]$/g, '') // 去掉模型可能加的引号
      .replace(/\s+/g, ' ')
    if (text.length === 0) return null
    return text.length > 16 ? text.slice(0, 16) : text
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
  const built = await buildModel(memoryConfig(config))
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
      '你在维护对用户的结构化画像。这份画像被所有对话共享，写错会到处误导用户，' +
      '所以**宁可少记、慢记，绝不记错**——只抽取用户「明确陈述」的、值得长期记住的新信息。\n' +
      '输出一个 JSON 数组，每个元素是一次操作：\n' +
      '- {"op":"ADD","category":..,"content":"..","inferred":bool,"factType":"world|experience|opinion","confidence":0~1}\n' +
      '- {"op":"UPDATE","id":"已有事实id","content":"..","confidence":0~1,"inferred":bool}（信息变化/纠正时；矛盾也用 UPDATE 覆盖，别新增重复）\n' +
      '- {"op":"DELETE","id":"已有事实id"}（仅当用户明确要求忘记某事）\n' +
      'category 取值：identity(身份)/preference(喜好)/concern(在意的事)/commitment(约定)/trait(性格)。\n' +
      '【保守规则，必须遵守】：\n' +
      '· 玩笑、假设（「如果…」）、反问、转述别人的话、一时情绪 → 不要记。\n' +
      '· 性格/情绪/作息这类推断设 inferred=true、confidence ≤ 0.4（只是猜测，不能当确定事实）。\n' +
      '· 用户明确说出的身份/喜好/约定等事实 confidence 0.8~0.9。\n' +
      '· **用户在纠正你（如「不是…是…」「我说的是…」「记错了」）→ 用 UPDATE 覆盖对应事实，confidence 设 0.95、inferred=false**（用户亲口纠正＝最权威）。\n' +
      '· 关键安全/健康事实（如过敏）设 "constant":true。\n' +
      '**没有值得记的新信息时，输出空数组 []**。闲聊/寒暄/客套不要记。只输出 JSON 数组，不要其它文字。',
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
