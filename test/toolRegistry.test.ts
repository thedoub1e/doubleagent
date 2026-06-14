import { describe, expect, it, vi } from 'vitest'
import { createRegistry, toToolDef } from '../src/main/tools/registry'
import type { ToolContext, ToolModule } from '../src/main/tools/types'

const ctx: ToolContext = {
  reminderList: '测试列表',
  startFocus: () => {},
  stopFocus: () => {}
}
// pi-ai ToolCall 结构 {id,name,arguments}；测试里用最小形状即可。
const call = (name: string, args: Record<string, unknown> = {}): never =>
  ({ id: `c-${name}`, name, arguments: args }) as never

const echoTool: ToolModule = {
  name: 'echo',
  description: '回显',
  parameters: { type: 'object', properties: { text: { type: 'string' } }, required: ['text'] },
  run: (args) => `echo:${String(args.text ?? '')}`
}

describe('toToolDef', () => {
  it('只取 name/description/parameters 暴露给模型', () => {
    const def = toToolDef(echoTool) as unknown as Record<string, unknown>
    expect(def.name).toBe('echo')
    expect(def.description).toBe('回显')
    expect(def.parameters).toEqual(echoTool.parameters)
    expect('run' in def).toBe(false)
  })
})

describe('createRegistry.toolDefs', () => {
  it('按注册顺序产出工具定义', () => {
    const reg = createRegistry([echoTool, { ...echoTool, name: 'echo2' }])
    expect(reg.toolDefs().map((t) => (t as unknown as { name: string }).name)).toEqual(['echo', 'echo2'])
  })
})

describe('createRegistry.dispatch', () => {
  it('按名分发并包成 ToolResult(toolCallId/toolName/text)', async () => {
    const reg = createRegistry([echoTool])
    const res = await reg.dispatch([call('echo', { text: '你好' })], ctx)
    expect(res).toEqual([{ toolCallId: 'c-echo', toolName: 'echo', text: 'echo:你好' }])
  })

  it('未知工具 → 友好占位，不抛错', async () => {
    const reg = createRegistry([echoTool])
    const res = await reg.dispatch([call('nope')], ctx)
    expect(res[0].text).toBe('未知工具：nope')
  })

  it('单个工具抛错被隔离成结果文本，不拖垮整轮', async () => {
    const boom: ToolModule = {
      name: 'boom',
      description: 'x',
      parameters: { type: 'object', properties: {} },
      run: () => {
        throw new Error('炸了')
      }
    }
    const reg = createRegistry([boom, echoTool])
    const res = await reg.dispatch([call('boom'), call('echo', { text: 'ok' })], ctx)
    expect(res[0].text).toContain('执行出错')
    expect(res[0].text).toContain('炸了')
    expect(res[1].text).toBe('echo:ok') // 后续工具仍正常执行
  })

  it('把 ctx 传给工具 run（startFocus 等本进程能力）', async () => {
    const startFocus = vi.fn()
    const focusTool: ToolModule = {
      name: 'go',
      description: 'x',
      parameters: { type: 'object', properties: {} },
      run: (_a, c) => {
        c.startFocus(25)
        return 'started'
      }
    }
    const reg = createRegistry([focusTool])
    await reg.dispatch([call('go')], { ...ctx, startFocus })
    expect(startFocus).toHaveBeenCalledWith(25)
  })
})
