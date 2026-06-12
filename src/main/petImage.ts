import { copyFileSync, existsSync, readFileSync } from 'node:fs'
import { extname, join } from 'node:path'
import { app } from 'electron'

const MIME: Record<string, string> = {
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.gif': 'image/gif',
  '.webp': 'image/webp'
}

export const PET_IMAGE_EXTENSIONS = ['png', 'jpg', 'jpeg', 'gif', 'webp']

/** 把用户选的图片复制进 userData（不进 git），返回存储路径。basename 区分单图 / 精灵图。 */
export function storePetImage(srcPath: string, basename = 'pet-image'): string {
  const ext = extname(srcPath).toLowerCase()
  const dest = join(app.getPath('userData'), `${basename}${ext}`)
  copyFileSync(srcPath, dest)
  return dest
}

/** 读成 data URL 给渲染层 <img> 用（CSP 允许 data:）。无效则返回 null。 */
export function petImageDataUrl(path: string | undefined): string | null {
  if (!path || !existsSync(path)) return null
  const mime = MIME[extname(path).toLowerCase()]
  if (!mime) return null
  try {
    return `data:${mime};base64,${readFileSync(path).toString('base64')}`
  } catch {
    return null
  }
}
