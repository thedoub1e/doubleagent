import { existsSync, readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { app } from 'electron'
import { emptyProfile, type UserProfile } from './profileUtil'

// 结构化用户画像持久化（profile.json）。与滚动摘要 memory.json 并存：
// 摘要=叙事背景，画像=精确档案。清空对话时一并清。
function profilePath(): string {
  return join(app.getPath('userData'), 'profile.json')
}

let cache: UserProfile | null = null

export function loadProfile(): UserProfile {
  if (cache) return cache
  try {
    cache = existsSync(profilePath())
      ? { ...emptyProfile(), ...(JSON.parse(readFileSync(profilePath(), 'utf-8')) as Partial<UserProfile>) }
      : emptyProfile()
  } catch {
    cache = emptyProfile()
  }
  return cache
}

export function saveProfile(profile: UserProfile): void {
  cache = profile
  try {
    writeFileSync(profilePath(), JSON.stringify(profile), 'utf-8')
  } catch {
    // 非致命：内存里仍有画像。
  }
}

export function clearProfile(): void {
  saveProfile(emptyProfile())
}
