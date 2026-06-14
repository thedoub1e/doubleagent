import type { Tool, ToolCall } from '@earendil-works/pi-ai'
import type { ToolContext, ToolModule, ToolResult } from './types'

// 工具注册引擎（Path B · Phase 0）：把一组 ToolModule 统一成"对模型暴露的定义"+"按名分发执行"。
// 取自 nanobot agent/tools/registry.py。加能力 = 往 PET_TOOL_MODULES 加一个模块，核心不动。

/** ToolModule → pi-ai 的 Tool 定义（只取 name/description/parameters；理由见 chat.ts 注释，纯对象等价 TypeBox）。 */
export function toToolDef(m: ToolModule): Tool {
  return { name: m.name, description: m.description, parameters: m.parameters } as unknown as Tool
}

export interface ToolRegistry {
  toolDefs: () => Tool[]
  get: (name: string) => ToolModule | undefined
  /** 执行模型发起的工具调用，逐个跑出结果文本回喂模型。单个工具抛错不拖垮整轮（隔离）。 */
  dispatch: (calls: ToolCall[], ctx: ToolContext) => Promise<ToolResult[]>
}

export function createRegistry(modules: ToolModule[]): ToolRegistry {
  const byName = new Map(modules.map((m) => [m.name, m]))
  return {
    toolDefs: () => modules.map(toToolDef),
    get: (name) => byName.get(name),
    async dispatch(calls, ctx) {
      const results: ToolResult[] = []
      for (const call of calls) {
        const mod = byName.get(call.name)
        const args = call.arguments ?? {}
        let text: string
        try {
          if (!mod) {
            text = `未知工具：${call.name}`
          } else if (mod.danger) {
            // 中央安全把关：danger 工具一律先 prepare(预校验)→ 不过直接拒、过了弹确认 → 同意才 run。
            const prep = mod.prepare
              ? await mod.prepare(args, ctx)
              : { title: `执行 ${call.name}`, detail: JSON.stringify(args).slice(0, 300) }
            if ('reject' in prep) {
              text = prep.reject
            } else if (!(await ctx.confirm(prep))) {
              text = '好，我没有做（你没同意）'
            } else {
              text = await mod.run(args, ctx)
            }
          } else {
            text = await mod.run(args, ctx)
          }
        } catch (e) {
          text = `工具「${call.name}」执行出错：${(e as Error)?.message ?? String(e)}`
        }
        results.push({ toolCallId: call.id, toolName: call.name, text })
      }
      return results
    }
  }
}
