// 工具总集 barrel：生活类(petTools) + 电脑实干类(computerTools)。
// 单一事实来源——index.ts 与场景测试都用这里，避免暴露给模型的工具集不一致。
import { toToolDef } from './registry'
import { PET_TOOL_MODULES } from './petTools'
import { COMPUTER_TOOL_MODULES } from './computerTools'
import type { ToolModule } from './types'

export const ALL_TOOL_MODULES: ToolModule[] = [...PET_TOOL_MODULES, ...COMPUTER_TOOL_MODULES]

/** 对模型暴露的全部工具定义。 */
export const ALL_TOOLS = ALL_TOOL_MODULES.map(toToolDef)
