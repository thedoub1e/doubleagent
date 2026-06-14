// 集成测试：驱动真实 sessions.ts（fs 持久化层，IPC 处理器直接调用的就是它）。
// electron 的 app.getPath 被 mock 到每个用例独立的临时目录，真读真写 sessions.json。
// 覆盖：全新启动 / 持久化重启不丢 / 多会话隔离 / 改名删除 / 清空 / 旧单流迁移。
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

let dir = ''
vi.mock('electron', () => ({ app: { getPath: (): string => dir } }))

beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), 'da-sessions-'))
  vi.resetModules()
})
afterEach(() => {
  rmSync(dir, { recursive: true, force: true })
})

type SessionsMod = typeof import('../src/main/sessions')
const load = (): Promise<SessionsMod> => import('../src/main/sessions')
const reopen = async (): Promise<SessionsMod> => {
  vi.resetModules() // 清掉模块内缓存 = 模拟 App 重启，强制从 sessions.json 重读
  return load()
}
const sessionsJson = (): string => join(dir, 'sessions.json')

describe('全新启动', () => {
  it('无任何文件 → 自动建一个默认会话并落盘', async () => {
    const s = await load()
    expect(s.listSessionMetas()).toHaveLength(1)
    expect(s.listSessionMetas()[0].title).toBe('新对话')
    expect(s.loadHistory()).toEqual([])
    expect(existsSync(sessionsJson())).toBe(true)
  })
})

describe('持久化：重启不丢', () => {
  it('发的消息写盘后，重启仍读得到', async () => {
    const s = await load()
    s.appendMessage({ role: 'user', content: '记得周三交论文' })
    s.appendMessage({ role: 'assistant', content: '好～我盯着' })

    const s2 = await reopen()
    const h = s2.loadHistory()
    expect(h).toHaveLength(2)
    expect(h[0].content).toBe('记得周三交论文')
    // 首条用户消息应已派生标题
    expect(s2.listSessionMetas()[0].title).toBe('记得周三交论文')
  })
})

describe('多会话隔离', () => {
  it('两个会话各聊各的，历史互不串味', async () => {
    const s = await load()
    s.appendMessage({ role: 'user', content: '项目评审' }) // 默认会话
    const firstId = s.activeSessionId()

    s.createSession() // 新会话并设为活跃
    s.appendMessage({ role: 'user', content: '只吃沙拉' })
    const secondId = s.activeSessionId()
    expect(secondId).not.toBe(firstId)
    expect(s.loadHistory().map((m) => m.content)).toEqual(['只吃沙拉'])

    s.switchSession(firstId)
    expect(s.loadHistory().map((m) => m.content)).toEqual(['项目评审'])
    expect(s.loadHistory().some((m) => m.content === '只吃沙拉')).toBe(false)
  })
})

describe('改名 / 删除', () => {
  it('改名只改目标会话且持久化', async () => {
    const s = await load()
    const id = s.activeSessionId()
    s.renameSessionTitle(id, '减肥计划')
    expect(s.listSessionMetas()[0].title).toBe('减肥计划')
    const s2 = await reopen()
    expect(s2.listSessionMetas()[0].title).toBe('减肥计划')
  })

  it('删除当前会话 → 自动切到剩下的并加载其历史', async () => {
    const s = await load()
    s.appendMessage({ role: 'user', content: 'A 的内容' })
    const a = s.activeSessionId()
    s.createSession()
    s.appendMessage({ role: 'user', content: 'B 的内容' })
    const b = s.activeSessionId()

    s.deleteSession(b) // 删当前(B)
    expect(s.activeSessionId()).toBe(a)
    expect(s.loadHistory().map((m) => m.content)).toEqual(['A 的内容'])
  })

  it('删到只剩一个、再删 → 自动补一个新会话(永远 ≥1)', async () => {
    const s = await load()
    const only = s.activeSessionId()
    s.deleteSession(only)
    expect(s.listSessionMetas()).toHaveLength(1) // 自动补建
    expect(s.activeSessionId()).not.toBe('') // 有有效活跃指针
  })
})

describe('清空当前对话 ≠ 删会话 ≠ 动别的会话', () => {
  it('清空只清当前会话的历史+摘要，另一个会话不受影响', async () => {
    const s = await load()
    s.appendMessage({ role: 'user', content: '保留我' })
    const keep = s.activeSessionId()
    s.createSession()
    s.appendMessage({ role: 'user', content: '我会被清掉' })
    s.saveMemory({ summary: '一些摘要', summarizedUpTo: 1 })

    s.clearActiveHistory()
    expect(s.loadHistory()).toEqual([]) // 当前会话清空
    expect(s.loadMemory()).toEqual({ summary: '', summarizedUpTo: 0 })
    expect(s.listSessionMetas()).toHaveLength(2) // 会话本身还在

    s.switchSession(keep)
    expect(s.loadHistory().map((m) => m.content)).toEqual(['保留我']) // 另一会话没动
  })
})

describe('滚动摘要按会话隔离', () => {
  it('saveMemory 只写当前会话；切到别的会话摘要为空', async () => {
    const s = await load()
    s.saveMemory({ summary: 'A 的长期记忆', summarizedUpTo: 3 })
    const a = s.activeSessionId()
    s.createSession()
    expect(s.loadMemory().summary).toBe('') // 新会话独立、摘要空
    s.switchSession(a)
    expect(s.loadMemory().summary).toBe('A 的长期记忆')
  })
})

describe('旧单流迁移', () => {
  it('首启把旧 history.json + memory.json 包成一个默认会话', async () => {
    writeFileSync(
      join(dir, 'history.json'),
      JSON.stringify([
        { role: 'assistant', content: '嗨' },
        { role: 'user', content: '我叫小敏' },
        { role: 'assistant', content: '你好小敏' }
      ]),
      'utf-8'
    )
    writeFileSync(
      join(dir, 'memory.json'),
      JSON.stringify({ summary: '旧的长期记忆', summarizedUpTo: 2 }),
      'utf-8'
    )

    const s = await load()
    expect(s.listSessionMetas()).toHaveLength(1)
    expect(s.listSessionMetas()[0].title).toBe('我叫小敏') // 从首条用户消息派生
    expect(s.loadHistory()).toHaveLength(3)
    expect(s.loadMemory()).toEqual({ summary: '旧的长期记忆', summarizedUpTo: 2 })
    // 迁移结果落盘
    const persisted = JSON.parse(readFileSync(sessionsJson(), 'utf-8'))
    expect(persisted.sessions).toHaveLength(1)
  })

  it('无旧数据时不误迁移，直接全新空会话', async () => {
    const s = await load()
    expect(s.loadHistory()).toEqual([])
    expect(s.listSessionMetas()[0].title).toBe('新对话')
  })
})
