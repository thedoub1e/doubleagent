import { existsSync, readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { app } from 'electron'

// 长期记忆：把较旧的对话滚动压缩成一段摘要，注入人设；避免历史无限增长撑爆上下文。
export interface Memory {
  summary: string
  summarizedUpTo: number // 已折叠进 summary 的历史消息条数
}

const DEFAULT: Memory = { summary: '', summarizedUpTo: 0 }

function memoryPath(): string {
  return join(app.getPath('userData'), 'memory.json')
}

let cache: Memory | null = null

export function loadMemory(): Memory {
  if (cache) return cache
  try {
    cache = existsSync(memoryPath())
      ? { ...DEFAULT, ...(JSON.parse(readFileSync(memoryPath(), 'utf-8')) as Partial<Memory>) }
      : { ...DEFAULT }
  } catch {
    cache = { ...DEFAULT }
  }
  return cache
}

export function saveMemory(memory: Memory): void {
  cache = memory
  try {
    writeFileSync(memoryPath(), JSON.stringify(memory), 'utf-8')
  } catch {
    // 非致命：内存里仍有摘要。
  }
}

export function clearMemory(): void {
  saveMemory({ ...DEFAULT })
}
