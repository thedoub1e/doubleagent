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

/**
 * 执行工具时可用的能力上下文。多数工具直接 import config/os 等模块即可；
 * 只有触达「主进程窗口/计时器」这类 index.ts 本地状态的，才通过 ctx 注入。
 */
export interface ToolContext {
  reminderList: string
  startFocus: (minutes: number) => void
  stopFocus: () => void
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
  run: (args: Record<string, unknown>, ctx: ToolContext) => Promise<string> | string
}
