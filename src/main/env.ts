import { existsSync, readFileSync } from 'node:fs'
import { join } from 'node:path'

// 零依赖读取项目根 .env（从源码运行时 cwd = 项目根）。仅填充尚未存在的环境变量。
// .env 已被 .gitignore 屏蔽，绝不进 git。
export function loadDotEnv(): void {
  const path = join(process.cwd(), '.env')
  if (!existsSync(path)) return
  try {
    for (const line of readFileSync(path, 'utf-8').split('\n')) {
      const trimmed = line.trim()
      if (trimmed.length === 0 || trimmed.startsWith('#')) continue
      const eq = trimmed.indexOf('=')
      if (eq === -1) continue
      const key = trimmed.slice(0, eq).trim()
      let val = trimmed.slice(eq + 1).trim()
      if (
        (val.startsWith('"') && val.endsWith('"')) ||
        (val.startsWith("'") && val.endsWith("'"))
      ) {
        val = val.slice(1, -1)
      }
      if (key.length > 0 && !(key in process.env)) process.env[key] = val
    }
  } catch {
    // .env 读取失败不致命：仍可走 UI 设置填 key。
  }
}
