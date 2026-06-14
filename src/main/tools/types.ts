// 工具引擎类型（Path B · Phase 0）：把"工具定义 + 执行"统一成可注册的模块。
// 取自 nanobot agent/tools/base.py 的思路：每个工具自带 schema + run + 危险标记。

// 工具参数用纯 JSON Schema 声明（不静态 import pi-ai 的 TypeBox，理由见 chat.ts 注释）。
export interface JsonSchemaProp {
  type: string
  description?: string
  items?: { type: string }
}
export interface JsonSchema {
  type: 'object'
  properties: Record<string, JsonSchemaProp>
  required?: string[]
}

/** 一次工具执行的结果，回喂给模型（多轮 agent 循环）。 */
export interface ToolResult {
  toolCallId: string
  toolName: string
  text: string
}

/** 危险操作向用户发起的确认请求（小白安全层）。 */
export interface ConfirmAction {
  title: string // 一句话说要做啥，如「跑这个命令」「改这个文件」
  detail: string // 具体内容，如命令本身 / 文件路径+片段
}

/** 危险工具预校验结果：{reject} = 直接拒绝不弹确认；ConfirmAction = 交给用户确认。 */
export type PrepareResult = ConfirmAction | { reject: string }

/**
 * 执行工具时可用的能力上下文。多数工具直接 import config/os 等模块即可；
 * 只有触达「主进程窗口/计时器/确认 UI」这类 index.ts 本地状态的，才通过 ctx 注入。
 */
export interface ToolContext {
  reminderList: string
  startFocus: (minutes: number) => void
  stopFocus: () => void
  // —— Path B 能力工具用 ——
  roots: string[] // 文件沙箱允许根（默认用户主目录）
  confirm: (action: ConfirmAction) => Promise<boolean> // 危险操作执行前的温柔确认；拒绝/超时=false
  audit: (entry: string) => void // 危险操作写本地审计日志，可回溯
}

/**
 * 一个工具模块 = 定义（name/description/parameters）+ 执行（run）。
 * danger 标记危险操作（写文件/跑命令/删除），Phase 2 安全层据此在执行前要求确认 + 沙箱。
 */
export interface ToolModule {
  name: string
  description: string
  parameters: JsonSchema
  danger?: boolean
  /**
   * 危险工具执行前的预校验 + 确认内容（小白安全层的中央把关入口）。
   * registry 对 danger 工具统一：先 prepare → 返回 {reject} 直接拒绝、返回 ConfirmAction 则弹确认，
   * 用户同意才调 run。这样 danger=true 在架构上强制有确认，单个工具忘了也兜得住。
   */
  prepare?: (
    args: Record<string, unknown>,
    ctx: ToolContext
  ) => PrepareResult | Promise<PrepareResult>
  run: (args: Record<string, unknown>, ctx: ToolContext) => Promise<string> | string
}
