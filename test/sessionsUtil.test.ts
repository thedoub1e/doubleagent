import { describe, expect, it } from 'vitest'
import {
  DEFAULT_TITLE,
  addSession,
  appendToActive,
  autoRetitle,
  clearActive,
  deriveTitle,
  freshStore,
  getActive,
  listMeta,
  migrateLegacy,
  newSession,
  removeSession,
  renameSession,
  setActive,
  setActiveMemory,
  type SessionMemory,
  type SessionMessage,
  type SessionsStore
} from '../src/main/sessionsUtil'

const T0 = 1_000
const memo = (summary: string, upTo: number): SessionMemory => ({ summary, summarizedUpTo: upTo })
const u = (content: string): SessionMessage => ({ role: 'user', content })
const a = (content: string): SessionMessage => ({ role: 'assistant', content })

describe('deriveTitle', () => {
  it('flattens whitespace and truncates long text', () => {
    expect(deriveTitle('  你好\n世界  ')).toBe('你好 世界')
    expect(deriveTitle('一二三四五六七八九十一二三四五六七八九十')).toBe('一二三四五六七八九十一二三四五六…')
  })
  it('falls back to default title on empty', () => {
    expect(deriveTitle('   ')).toBe(DEFAULT_TITLE)
  })
})

describe('freshStore / newSession', () => {
  it('creates one default active session', () => {
    const store = freshStore('s1', T0)
    expect(store.activeId).toBe('s1')
    expect(store.sessions).toHaveLength(1)
    expect(store.sessions[0].meta.title).toBe(DEFAULT_TITLE)
    expect(store.sessions[0].history).toEqual([])
    expect(store.sessions[0].memory).toEqual(memo('', 0))
  })
})

describe('migrateLegacy', () => {
  it('wraps legacy history+memory into one active session titled from first user msg', () => {
    const store = migrateLegacy('s1', [a('嗨'), u('我叫小敏'), a('你好小敏')], memo('旧摘要', 2), T0)
    expect(store.activeId).toBe('s1')
    expect(store.sessions).toHaveLength(1)
    expect(store.sessions[0].meta.title).toBe('我叫小敏')
    expect(store.sessions[0].history).toHaveLength(3)
    expect(store.sessions[0].memory).toEqual(memo('旧摘要', 2))
  })
  it('uses default title when no user message exists', () => {
    const store = migrateLegacy('s1', [a('主动问候')], memo('', 0), T0)
    expect(store.sessions[0].meta.title).toBe(DEFAULT_TITLE)
  })
})

describe('appendToActive', () => {
  it('appends, auto-titles from first user msg, bumps timestamps, and does not mutate input', () => {
    const store = freshStore('s1', T0)
    const next = appendToActive(store, u('帮我记一下买牛奶'), T0 + 5)
    expect(next.sessions[0].history).toEqual([u('帮我记一下买牛奶')])
    expect(next.sessions[0].meta.title).toBe('帮我记一下买牛奶')
    expect(next.sessions[0].meta.lastMessageAt).toBe(T0 + 5)
    // 原 store 未被改动
    expect(store.sessions[0].history).toEqual([])
    expect(store.sessions[0].meta.title).toBe(DEFAULT_TITLE)
  })
  it('does not re-title after the first user message', () => {
    let store = freshStore('s1', T0)
    store = appendToActive(store, u('第一句'), T0 + 1)
    store = appendToActive(store, a('回应'), T0 + 2)
    store = appendToActive(store, u('第二句'), T0 + 3)
    expect(store.sessions[0].meta.title).toBe('第一句')
  })
  it('does not title from a leading assistant (proactive) message', () => {
    let store = freshStore('s1', T0)
    store = appendToActive(store, a('主动提醒：该喝水啦'), T0 + 1)
    expect(store.sessions[0].meta.title).toBe(DEFAULT_TITLE)
  })
})

describe('clearActive', () => {
  it('empties active history and memory but keeps the session', () => {
    let store = freshStore('s1', T0)
    store = appendToActive(store, u('一句话'), T0 + 1)
    store = setActiveMemory(store, memo('摘要', 1), T0 + 2)
    const cleared = clearActive(store, T0 + 9)
    expect(cleared.sessions[0].history).toEqual([])
    expect(cleared.sessions[0].memory).toEqual(memo('', 0))
    expect(cleared.sessions).toHaveLength(1)
  })
})

describe('setActive / getActive / addSession', () => {
  it('addSession appends and switches active; getActive returns it', () => {
    const store = addSession(freshStore('s1', T0), newSession('s2', DEFAULT_TITLE, T0 + 1))
    expect(store.activeId).toBe('s2')
    expect(store.sessions).toHaveLength(2)
    expect(getActive(store)?.meta.id).toBe('s2')
  })
  it('setActive ignores unknown id', () => {
    const store = setActive(freshStore('s1', T0), 'nope')
    expect(store.activeId).toBe('s1')
  })
})

describe('renameSession', () => {
  it('renames only the targeted session, trims, ignores empty', () => {
    let store = addSession(freshStore('s1', T0), newSession('s2', DEFAULT_TITLE, T0 + 1))
    store = renameSession(store, 's1', '  减肥计划  ', T0 + 2)
    expect(store.sessions.find((s) => s.meta.id === 's1')?.meta.title).toBe('减肥计划')
    expect(store.sessions.find((s) => s.meta.id === 's2')?.meta.title).toBe(DEFAULT_TITLE)
    const unchanged = renameSession(store, 's1', '   ', T0 + 3)
    expect(unchanged.sessions.find((s) => s.meta.id === 's1')?.meta.title).toBe('减肥计划')
  })
})

describe('标题：自动 vs 用户改名 vs 模型总结', () => {
  it('新会话默认 autoTitled=true', () => {
    expect(freshStore('s1', T0).sessions[0].meta.autoTitled).toBe(true)
  })
  it('用户改名 → autoTitled=false（此后不再被自动覆盖）', () => {
    const store = renameSession(freshStore('s1', T0), 's1', '减肥计划', T0 + 1)
    expect(store.sessions[0].meta.title).toBe('减肥计划')
    expect(store.sessions[0].meta.autoTitled).toBe(false)
  })
  it('autoRetitle 在自动标题时套用模型标题并标 titledByLLM，保持 autoTitled', () => {
    const store = autoRetitle(freshStore('s1', T0), 's1', '花生过敏', T0 + 1)
    expect(store.sessions[0].meta.title).toBe('花生过敏')
    expect(store.sessions[0].meta.titledByLLM).toBe(true)
    expect(store.sessions[0].meta.autoTitled).toBe(true)
  })
  it('autoRetitle 不覆盖用户已手动改的标题', () => {
    let store = renameSession(freshStore('s1', T0), 's1', '我自己起的名', T0 + 1)
    store = autoRetitle(store, 's1', '模型想改的名', T0 + 2)
    expect(store.sessions[0].meta.title).toBe('我自己起的名') // 用户优先
  })
})

describe('removeSession', () => {
  it('removes a non-active session and keeps active pointer', () => {
    let store = addSession(freshStore('s1', T0), newSession('s2', DEFAULT_TITLE, T0 + 1))
    store = setActive(store, 's1')
    const next = removeSession(store, 's2')
    expect(next.sessions).toHaveLength(1)
    expect(next.activeId).toBe('s1')
  })
  it('reassigns active to most-recent remaining when active is removed', () => {
    let store: SessionsStore = freshStore('s1', T0)
    store = addSession(store, newSession('s2', DEFAULT_TITLE, T0 + 10)) // active=s2
    store = addSession(store, newSession('s3', DEFAULT_TITLE, T0 + 5)) // active=s3
    const next = removeSession(store, 's3')
    expect(next.activeId).toBe('s2') // s2 lastMessageAt 更近
    expect(next.sessions.map((s) => s.meta.id)).toEqual(['s1', 's2'])
  })
  it('leaves activeId empty when last session removed (caller refills)', () => {
    const next = removeSession(freshStore('s1', T0), 's1')
    expect(next.sessions).toHaveLength(0)
    expect(next.activeId).toBe('')
  })
})

describe('listMeta', () => {
  it('returns metas sorted by most recent activity', () => {
    let store: SessionsStore = freshStore('s1', T0)
    store = addSession(store, newSession('s2', DEFAULT_TITLE, T0 + 100))
    store = appendToActive(store, u('hi'), T0 + 200) // s2 -> 200
    const metas = listMeta(store)
    expect(metas.map((m) => m.id)).toEqual(['s2', 's1'])
  })
})
