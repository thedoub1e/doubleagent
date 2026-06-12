import { existsSync, readdirSync, readFileSync } from 'node:fs'
import { extname, join } from 'node:path'

// 动图集：扫 gif图/ 文件夹，按文件名关键词把每个动图归到「待机/思考/回复/提醒」四个池子，
// 读成 data URL 给渲染层 <img> 播放（动态 webp/gif 自带动画）。CSP 允许 data:。

export type PetState = 'idle' | 'thinking' | 'reply' | 'attention'
export type PetGifPools = Record<PetState, string[]>

export const ASSET_DIR = 'gif图'
const MIME: Record<string, string> = {
  '.webp': 'image/webp',
  '.gif': 'image/gif',
  '.png': 'image/png',
  '.apng': 'image/apng',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg'
}

// 按顺序匹配，命中第一条规则即归类；都不中 → 待机。
// 「待机」放最前：显式标了"待机"的（如 敲电脑可作待机）优先进待机池。
const RULES: Array<[PetState, string[]]> = [
  ['idle', ['待机', '无聊', '发呆', '睡', '趴', '走路', '哼歌', '散步']],
  ['thinking', ['思考', '老师', '看书', '学习', '疑惑', '敲电脑', '认真']],
  ['attention', ['拉拉队', '加油', '提醒', '左右跳', '蹦', '兴奋', '欢呼', '打call']],
  ['reply', ['打招呼', '招手', '挥手', '拍手', '爱心', '比心', '消息', '耳朵', '笑', '开心', '亲']]
]

function categorize(filename: string): PetState {
  for (const [state, keywords] of RULES) {
    if (keywords.some((kw) => filename.includes(kw))) return state
  }
  return 'idle'
}

function toDataUrl(path: string): string | null {
  const mime = MIME[extname(path).toLowerCase()]
  if (!mime) return null
  try {
    return `data:${mime};base64,${readFileSync(path).toString('base64')}`
  } catch {
    return null
  }
}

/** 加载动图集。dir 为 gif图 文件夹绝对路径。无目录 / 无可用动图时返回空池（上层回退自绘狗）。 */
export function loadGifPools(dir: string): PetGifPools {
  const pools: PetGifPools = { idle: [], thinking: [], reply: [], attention: [] }
  if (!existsSync(dir)) return pools
  let files: string[]
  try {
    files = readdirSync(dir)
  } catch {
    return pools
  }
  for (const name of files) {
    if (name.startsWith('.')) continue
    const url = toDataUrl(join(dir, name))
    if (!url) continue
    pools[categorize(name)].push(url)
  }
  return pools
}

export function hasAnyGif(pools: PetGifPools): boolean {
  return (
    pools.idle.length > 0 ||
    pools.thinking.length > 0 ||
    pools.reply.length > 0 ||
    pools.attention.length > 0
  )
}
