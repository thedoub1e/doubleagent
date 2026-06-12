import { existsSync, readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { app } from 'electron'
import type { ChatMessage } from './chat'

// 对话记忆（首版）：本地持久化全量历史。长期记忆（滚动摘要）作为后续增强。
function historyPath(): string {
  return join(app.getPath('userData'), 'history.json')
}

let cache: ChatMessage[] | null = null

export function loadHistory(): ChatMessage[] {
  if (cache) return cache
  try {
    cache = existsSync(historyPath())
      ? (JSON.parse(readFileSync(historyPath(), 'utf-8')) as ChatMessage[])
      : []
  } catch {
    cache = []
  }
  return cache
}

export function saveHistory(history: ChatMessage[]): void {
  cache = history
  try {
    writeFileSync(historyPath(), JSON.stringify(history), 'utf-8')
  } catch {
    // 持久化失败不致命：内存里仍有当轮历史。
  }
}

export function appendMessage(message: ChatMessage): ChatMessage[] {
  const next = [...loadHistory(), message]
  saveHistory(next)
  return next
}

export function clearHistory(): void {
  saveHistory([])
}
