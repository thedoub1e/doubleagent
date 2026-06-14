// 纯函数（无 electron / 无 IO）：多会话存储的不可变操作。可单测。
// 设计：每个会话各自持有「可见历史 + 滚动摘要」(隔离层，互不串味)；
// 结构化画像 profile.json 另在全局单份(共享层)，不归本模块管。

export interface SessionMessage {
  role: 'user' | 'assistant'
  content: string
}

// 每会话独立的长期记忆（滚动摘要）——结构同旧 memory.json，但按会话隔离。
export interface SessionMemory {
  summary: string
  summarizedUpTo: number
}

export interface SessionMeta {
  id: string
  title: string
  createdAt: number
  updatedAt: number
  lastMessageAt: number
}

export interface SessionState {
  meta: SessionMeta
  history: SessionMessage[]
  memory: SessionMemory
}

export interface SessionsStore {
  activeId: string
  sessions: SessionState[] // 存储保持插入序；展示排序由 UI 决定
}

export const DEFAULT_TITLE = '新对话'
const TITLE_MAX = 16

export function emptyMemory(): SessionMemory {
  return { summary: '', summarizedUpTo: 0 }
}

/** 从首条用户消息派生标题（去换行、截断）。空内容回退默认标题。 */
export function deriveTitle(text: string): string {
  const flat = (text ?? '').replace(/\s+/g, ' ').trim()
  if (flat.length === 0) return DEFAULT_TITLE
  return flat.length > TITLE_MAX ? `${flat.slice(0, TITLE_MAX)}…` : flat
}

/** 新建一个空会话（指定 id/标题/时间）。 */
export function newSession(id: string, title: string, now: number): SessionState {
  return {
    meta: { id, title, createdAt: now, updatedAt: now, lastMessageAt: now },
    history: [],
    memory: emptyMemory()
  }
}

/** 全新存储（无可迁移的旧数据）：一个默认会话并设为活跃。 */
export function freshStore(id: string, now: number): SessionsStore {
  return { activeId: id, sessions: [newSession(id, DEFAULT_TITLE, now)] }
}

/** 把旧单流（history.json + memory.json）迁移成一个默认会话，设为活跃。 */
export function migrateLegacy(
  id: string,
  history: readonly SessionMessage[],
  memory: SessionMemory,
  now: number
): SessionsStore {
  const firstUser = history.find((m) => m.role === 'user')
  const title = firstUser ? deriveTitle(firstUser.content) : DEFAULT_TITLE
  return {
    activeId: id,
    sessions: [
      {
        meta: { id, title, createdAt: now, updatedAt: now, lastMessageAt: now },
        history: history.slice(),
        memory: { ...memory }
      }
    ]
  }
}

export function getActive(store: SessionsStore): SessionState | undefined {
  return store.sessions.find((s) => s.meta.id === store.activeId)
}

export function setActive(store: SessionsStore, id: string): SessionsStore {
  if (!store.sessions.some((s) => s.meta.id === id)) return store
  return { ...store, activeId: id }
}

/** 追加一个会话并设为活跃（不可变）。 */
export function addSession(store: SessionsStore, session: SessionState): SessionsStore {
  return { activeId: session.meta.id, sessions: [...store.sessions, session] }
}

/** 用 fn 改活跃会话（history/memory），并刷新 updatedAt（不可变，绝不改入参）。 */
export function mapActive(
  store: SessionsStore,
  fn: (s: SessionState) => SessionState
): SessionsStore {
  return {
    ...store,
    sessions: store.sessions.map((s) => (s.meta.id === store.activeId ? fn(s) : s))
  }
}

/** 向活跃会话追加消息：自动从首条用户消息派生标题、刷新时间戳（不可变）。 */
export function appendToActive(
  store: SessionsStore,
  msg: SessionMessage,
  now: number
): SessionsStore {
  return mapActive(store, (s) => {
    const hadUser = s.history.some((m) => m.role === 'user')
    const title =
      s.meta.title === DEFAULT_TITLE && msg.role === 'user' && !hadUser
        ? deriveTitle(msg.content)
        : s.meta.title
    return {
      ...s,
      history: [...s.history, msg],
      meta: { ...s.meta, title, updatedAt: now, lastMessageAt: now }
    }
  })
}

/** 清空活跃会话的历史 + 滚动摘要（保留会话本身、标题与画像；画像全局另管）。 */
export function clearActive(store: SessionsStore, now: number): SessionsStore {
  return mapActive(store, (s) => ({
    ...s,
    history: [],
    memory: emptyMemory(),
    meta: { ...s.meta, updatedAt: now, lastMessageAt: now }
  }))
}

/** 设置活跃会话的滚动摘要（不可变）。 */
export function setActiveMemory(
  store: SessionsStore,
  memory: SessionMemory,
  now: number
): SessionsStore {
  return mapActive(store, (s) => ({ ...s, memory, meta: { ...s.meta, updatedAt: now } }))
}

export function renameSession(
  store: SessionsStore,
  id: string,
  title: string,
  now: number
): SessionsStore {
  const trimmed = (title ?? '').replace(/\s+/g, ' ').trim()
  if (trimmed.length === 0) return store
  return {
    ...store,
    sessions: store.sessions.map((s) =>
      s.meta.id === id ? { ...s, meta: { ...s.meta, title: trimmed, updatedAt: now } } : s
    )
  }
}

function mostRecentId(sessions: readonly SessionState[]): string {
  let best: SessionState | undefined
  for (const s of sessions) {
    if (!best || s.meta.lastMessageAt > best.meta.lastMessageAt) best = s
  }
  return best?.meta.id ?? ''
}

/**
 * 删除会话（不可变）。若删的是活跃会话，活跃指针切到剩余里最近活动的一个；
 * 删空后 activeId='' —— 由调用方（fs 层）补建一个新会话，保证至少有一个。
 */
export function removeSession(store: SessionsStore, id: string): SessionsStore {
  const sessions = store.sessions.filter((s) => s.meta.id !== id)
  const activeId = store.activeId === id ? mostRecentId(sessions) : store.activeId
  return { activeId, sessions }
}

/** 列出会话元信息（按最近活动倒序，供 UI 渲染会话列表）。 */
export function listMeta(store: SessionsStore): SessionMeta[] {
  return store.sessions
    .map((s) => s.meta)
    .slice()
    .sort((a, b) => b.lastMessageAt - a.lastMessageAt)
}
