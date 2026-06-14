// 小白安全层（Path B · Phase 2）纯函数：文件沙箱 / shell 命令闸 / URL 闸 / 输出截断。
// 全部无 IO、无 electron，可单测。危险能力(写/删/跑命令)的"绝不让她误伤电脑"靠这里 + 确认 UI 兜住。
import { homedir } from 'node:os'
import { resolve, sep } from 'node:path'

/** 默认文件沙箱根：用户主目录（及其所有子目录）。文件读写只许在此范围内，防越界碰系统文件。 */
export function defaultRoots(): string[] {
  return [homedir()]
}

export type SafePath = { ok: true; path: string } | { ok: false; reason: string }

/** 把请求路径解析为绝对路径并校验是否落在允许根内（展开 ~、消解 ../，防目录穿越）。 */
export function resolveWithinRoots(roots: readonly string[], requested: string, cwd?: string): SafePath {
  const raw = (requested ?? '').trim()
  if (raw.length === 0) return { ok: false, reason: '没有给路径' }
  const expanded = raw === '~' || raw.startsWith('~/') ? raw.replace(/^~/, homedir()) : raw
  const abs = resolve(cwd ?? homedir(), expanded)
  const within = roots.some((root) => {
    const r = resolve(root)
    return abs === r || abs.startsWith(r + sep)
  })
  if (!within) {
    return { ok: false, reason: `路径超出允许范围（只能在 ${roots.join('、')} 内操作）` }
  }
  return { ok: true, path: abs }
}

export type CommandCheck = { ok: true } | { ok: false; reason: string }

// shell 命令黑名单：明显会毁电脑/越权的操作直接拦死，绝不交给确认（双保险）。
// 注：黑名单不可能穷尽（base64/语言层绕过等），真正的控制是「每条命令都给用户看+确认才跑」；
// 这里只兜住最常见的灾难性写法，避免用户手滑点允许。
const DANGEROUS_PATTERNS: { re: RegExp; why: string }[] = [
  { re: /\bsudo\b|^\s*su\b|\s+su\s/i, why: '提权' },
  { re: /\bmkfs\b|\bdd\s+if=|\bdiskutil\s+(erase|reformat|partitiondisk)/i, why: '磁盘格式化/擦除' },
  { re: /\b(shutdown|reboot|halt|poweroff)\b/i, why: '关机/重启' },
  { re: />\s*\/dev\/(sd|disk|rdisk)/i, why: '直接写磁盘设备' },
  { re: /:\s*\(\s*\)\s*\{.*:.*\|.*:.*&.*\}/, why: 'fork 炸弹' },
  { re: /\bchmod\s+-R\s+0*777\s+\//i, why: '危险全局权限' },
  { re: /\b(curl|wget)\b[^|&]*(\|\s*|&&\s*)(sudo\s+)?(bash|sh|zsh)\b/i, why: '下载即执行脚本' },
  { re: /\b(bash|sh|zsh)\s+<\(/i, why: '进程替换执行' }
]

/** rm 命令是否危险：同时带"递归"和"强制"（任意顺序/拆分/长写法），或递归删根/主目录。 */
function isDangerousRm(c: string): boolean {
  if (!/\brm\b/.test(c)) return false
  const recursive = /(^|\s)-[a-z]*r/i.test(c) || /--recursive/i.test(c)
  const force = /(^|\s)-[a-z]*f/i.test(c) || /--force/i.test(c)
  const hitsRootOrHome = /(^|\s)(\/|~|\$HOME)(\/?\s|\/?$)/.test(c)
  return (recursive && force) || (recursive && hitsRootOrHome)
}

/** shell 命令安全闸：命中黑名单直接拒绝（带原因）；否则放行（仍需用户确认才真跑）。 */
export function checkCommand(cmd: string): CommandCheck {
  const c = (cmd ?? '').trim()
  if (c.length === 0) return { ok: false, reason: '空命令' }
  if (isDangerousRm(c)) return { ok: false, reason: '命令含危险操作（递归强制删除/删根目录），为安全起见已拦下' }
  for (const { re, why } of DANGEROUS_PATTERNS) {
    if (re.test(c)) return { ok: false, reason: `命令含危险操作（${why}），为安全起见已拦下` }
  }
  return { ok: true }
}

// 敏感凭据文件：即便在沙箱内也不让读（防把密钥/凭据喂给模型）。.env 常用于排查故保留可读。
const SENSITIVE_PATH = [
  /\/\.ssh(\/|$)/i,
  /\/\.aws(\/|$)/i,
  /\/\.gnupg(\/|$)/i,
  /\/(id_rsa|id_ed25519|id_ecdsa|id_dsa)(\.pub)?$/i,
  /\.(pem|key|p12|pfx)$/i,
  /\.keychain(-db)?$/i,
  /\/\.config\/[^/]*\/(token|secret|credential)/i
]

/** 是否敏感凭据路径（密钥/凭据/keychain）。读取这类文件直接拒绝。 */
export function isSensitivePath(p: string): boolean {
  return SENSITIVE_PATH.some((re) => re.test(p))
}

export type UrlCheck = { ok: true; url: string } | { ok: false; reason: string }

// 私网/内网/本机地址：防 SSRF（让模型去打内部服务）。只放行公网 http(s)。
// IPv6 经 URL 规范化后回环=::1、IPv4映射=::ffff:7f00:1(十六进制)、链路本地=fe80:、ULA=fc00:/fd..；
// 故对 ::ffff: 映射一律拦（少见且高风险），并覆盖 ::1/fe80/fc/fd。匹配前已去掉方括号。
const PRIVATE_HOST =
  /^(localhost|127\.|0\.0\.0\.0|10\.|169\.254\.|192\.168\.|172\.(1[6-9]|2\d|3[01])\.|::1$|::ffff:|fe80:|fc00:|fd[0-9a-f]{2}:)/i

/** URL 安全闸：只允许公网 http/https，挡掉 localhost/内网/非 http 协议。 */
export function isUrlAllowed(input: string): UrlCheck {
  const raw = (input ?? '').trim()
  if (raw.length === 0) return { ok: false, reason: '没有给网址' }
  let u: URL
  try {
    u = new URL(raw)
  } catch {
    return { ok: false, reason: '网址格式不对' }
  }
  if (u.protocol !== 'http:' && u.protocol !== 'https:') {
    return { ok: false, reason: '只支持 http/https 网址' }
  }
  const host = u.hostname.replace(/^\[|\]$/g, '') // 去掉 IPv6 的方括号再判
  if (PRIVATE_HOST.test(host)) {
    return { ok: false, reason: '不访问本机/内网地址' }
  }
  return { ok: true, url: u.toString() }
}

/** 输出截断：防超长终端/文件输出撑爆上下文。保留头部，标注省略量。 */
export function truncateOutput(text: string, maxChars = 4000): string {
  const t = text ?? ''
  if (t.length <= maxChars) return t
  return `${t.slice(0, maxChars)}\n…（输出过长已截断，原文共 ${t.length} 字）`
}
