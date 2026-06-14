import { existsSync, readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { app } from 'electron'
import type { ChatMessage } from './chat'
import {
  addSession,
  appendToActive,
  clearActive,
  freshStore,
  getActive,
  listMeta,
  migrateLegacy,
  newSession,
  removeSession,
  renameSession,
  setActive,
  setActiveMemory,
  DEFAULT_TITLE,
  type SessionMemory,
  type SessionMeta,
  type SessionsStore
} from './sessionsUtil'

// 多会话持久化（fs 层）：单文件 sessions.json 存所有会话的「可见历史 + 滚动摘要」(隔离层)。
// 结构化画像在 profile.json 全局单份(共享层)，不归本模块。首启迁移旧单流 history.json/memory.json。

function storePath(): string {
  return join(app.getPath('userData'), 'sessions.json')
}
function legacyHistoryPath(): string {
  return join(app.getPath('userData'), 'history.json')
}
function legacyMemoryPath(): string {
  return join(app.getPath('userData'), 'memory.json')
}

let cache: SessionsStore | null = null
let idSeq = 0

/** 生成本机唯一会话 id（fs 层可用 Date.now；纯函数层不行）。 */
function freshId(): string {
  return `s-${Date.now().toString(36)}-${idSeq++}`
}

function readJson<T>(path: string, fallback: T): T {
  try {
    return existsSync(path) ? (JSON.parse(readFileSync(path, 'utf-8')) as T) : fallback
  } catch {
    return fallback
  }
}

/** 首启迁移：把旧单流 history.json + memory.json 包成一个默认会话；无旧数据则全新。 */
function migrateOrFresh(): SessionsStore {
  const now = Date.now()
  const history = readJson<ChatMessage[]>(legacyHistoryPath(), [])
  const memory = readJson<SessionMemory>(legacyMemoryPath(), { summary: '', summarizedUpTo: 0 })
  const hasLegacy = history.length > 0 || (memory.summary?.length ?? 0) > 0
  return hasLegacy ? migrateLegacy(freshId(), history, memory, now) : freshStore(freshId(), now)
}

function load(): SessionsStore {
  if (cache) return cache
  if (existsSync(storePath())) {
    const parsed = readJson<SessionsStore | null>(storePath(), null)
    if (parsed && Array.isArray(parsed.sessions) && parsed.sessions.length > 0) {
      cache = parsed
      return cache
    }
  }
  cache = migrateOrFresh()
  persist()
  return cache
}

function persist(): void {
  if (!cache) return
  try {
    writeFileSync(storePath(), JSON.stringify(cache), 'utf-8')
  } catch {
    // 非致命：内存里仍有当前会话状态。
  }
}

function commit(next: SessionsStore): SessionsStore {
  cache = next
  persist()
  return cache
}

/** 始终保证至少有一个会话且 activeId 有效（删空 / 数据异常时兜底）。 */
function ensureActive(store: SessionsStore): SessionsStore {
  if (store.sessions.length === 0) {
    return freshStore(freshId(), Date.now())
  }
  if (!store.sessions.some((s) => s.meta.id === store.activeId)) {
    return { ...store, activeId: store.sessions[0].meta.id }
  }
  return store
}

// ---- 活跃会话读写（保持与旧 history.ts/memory.ts 同名接口，调用方无感切换） ----

export function loadHistory(): ChatMessage[] {
  return getActive(load())?.history ?? []
}

export function appendMessage(message: ChatMessage): ChatMessage[] {
  const next = appendToActive(load(), message, Date.now())
  return getActive(commit(next))?.history ?? []
}

/** 清空当前会话的历史 + 滚动摘要（保留会话与标题；画像全局另管，不在此清）。 */
export function clearActiveHistory(): void {
  commit(clearActive(load(), Date.now()))
}

export function loadMemory(): SessionMemory {
  return getActive(load())?.memory ?? { summary: '', summarizedUpTo: 0 }
}

export function saveMemory(memory: SessionMemory): void {
  commit(setActiveMemory(load(), memory, Date.now()))
}

// ---- 会话管理 ----

export function listSessionMetas(): SessionMeta[] {
  return listMeta(load())
}

export function activeSessionId(): string {
  return load().activeId
}

/** 新建一个空会话并设为活跃，返回其元信息。 */
export function createSession(): SessionMeta {
  const session = newSession(freshId(), DEFAULT_TITLE, Date.now())
  commit(addSession(load(), session))
  return session.meta
}

export function switchSession(id: string): void {
  commit(setActive(load(), id))
}

export function renameSessionTitle(id: string, title: string): void {
  commit(renameSession(load(), id, title, Date.now()))
}

/** 删除会话；若删空则自动补建一个新会话，保证至少有一个。 */
export function deleteSession(id: string): void {
  commit(ensureActive(removeSession(load(), id)))
}
