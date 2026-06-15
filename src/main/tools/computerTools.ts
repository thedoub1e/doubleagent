// 能力工具（Path B · Phase 1，移植自 nanobot agent/tools 的 filesystem/web/shell）。
// 让小狗能真在电脑上做事：读写文件、列目录、搜内容、上网、跑命令。
// 危险操作(写/跑命令)一律 danger=true → 执行前经 ctx.confirm 确认 + ctx.audit 审计；
// 文件限沙箱根、shell 过黑名单闸、URL 过 SSRF 闸（见 safety.ts）。
import { exec } from 'node:child_process'
import { mkdir, readdir, readFile, realpath, stat, writeFile } from 'node:fs/promises'
import { dirname, sep } from 'node:path'
import { homedir } from 'node:os'
import { promisify } from 'node:util'
import {
  checkCommand,
  isSensitivePath,
  isUrlAllowed,
  resolveWithinRoots,
  truncateOutput
} from './safety'
import type { ToolModule } from './types'

const execAsync = promisify(exec)

const MAX_READ_BYTES = 1024 * 1024 // 单文件读取上限 1MB
const READ_TRUNCATE = 6000 // 读文件回喂模型的字符上限
const CMD_TIMEOUT_MS = 20_000 // 命令超时
const CMD_MAX_BUFFER = 1024 * 1024 // 命令输出缓冲上限

const readFileTool: ToolModule = {
  name: 'read_file',
  description: '读取一个文本文件的内容（只读，限用户主目录范围内）。用于查看代码/配置/笔记等。',
  parameters: {
    type: 'object',
    properties: { path: { type: 'string', description: '文件路径，可用 ~ 代表主目录，如 ~/Documents/a.txt' } },
    required: ['path']
  },
  async run(args, ctx) {
    const sp = resolveWithinRoots(ctx.roots, String(args.path ?? ''))
    if (!sp.ok) return sp.reason
    if (isSensitivePath(sp.path)) return '这是密钥/凭据类文件，出于安全我不读它哦'
    try {
      const st = await stat(sp.path)
      if (st.isDirectory()) return `「${args.path}」是个文件夹，用 list_dir 看里面有什么`
      if (st.size > MAX_READ_BYTES) return `这个文件有点大（${(st.size / 1024).toFixed(0)}KB），先用别的方式看吧`
      const text = await readFile(sp.path, 'utf-8')
      return truncateOutput(text, READ_TRUNCATE)
    } catch (e) {
      return `读不了这个文件：${(e as Error).message}`
    }
  }
}

const listDirTool: ToolModule = {
  name: 'list_dir',
  description: '列出一个文件夹里的文件和子文件夹（只读，限用户主目录范围内）。',
  parameters: {
    type: 'object',
    properties: { path: { type: 'string', description: '文件夹路径，可用 ~，如 ~/Desktop' } },
    required: ['path']
  },
  async run(args, ctx) {
    const sp = resolveWithinRoots(ctx.roots, String(args.path ?? ''))
    if (!sp.ok) return sp.reason
    try {
      const entries = await readdir(sp.path, { withFileTypes: true })
      if (entries.length === 0) return '（这个文件夹是空的）'
      const lines = entries
        .slice(0, 200)
        .map((e) => (e.isDirectory() ? `${e.name}/` : e.name))
        .sort()
      const more = entries.length > 200 ? `\n…（共 ${entries.length} 项，只列了前 200）` : ''
      return lines.join('\n') + more
    } catch (e) {
      return `打不开这个文件夹：${(e as Error).message}`
    }
  }
}

const SEARCH_SKIP = new Set(['node_modules', '.git', '.venv', 'dist', 'out', 'build', '.next', 'Library'])
const SEARCH_MAX_FILES = 400
const SEARCH_MAX_HITS = 40

/** 在沙箱根内按内容搜文件（bounded：跳过依赖目录、限文件数与命中数）。只读。 */
async function searchInDir(root: string, query: string): Promise<string[]> {
  const hits: string[] = []
  let scanned = 0
  const q = query.toLowerCase()
  const walk = async (dir: string, depth: number): Promise<void> => {
    if (depth > 6 || scanned >= SEARCH_MAX_FILES || hits.length >= SEARCH_MAX_HITS) return
    const entries = await readdir(dir, { withFileTypes: true }).catch(() => [])
    for (const e of entries) {
      if (scanned >= SEARCH_MAX_FILES || hits.length >= SEARCH_MAX_HITS) return
      if (e.name.startsWith('.') && e.name !== '.env') continue
      const full = `${dir}/${e.name}`
      if (e.isDirectory()) {
        if (!SEARCH_SKIP.has(e.name)) await walk(full, depth + 1)
        continue
      }
      if (isSensitivePath(full)) continue // 不搜密钥/凭据类文件
      scanned++
      try {
        const st = await stat(full)
        if (st.size > 512 * 1024) continue // 跳过大文件
        const text = await readFile(full, 'utf-8')
        const idx = text.toLowerCase().indexOf(q)
        if (idx !== -1) {
          const line = text.slice(0, idx).split('\n').length
          hits.push(`${full}:${line}`)
        }
      } catch {
        // 二进制/读不了 → 跳过
      }
    }
  }
  await walk(root, 0)
  return hits
}

const searchFilesTool: ToolModule = {
  name: 'search_files',
  description: '在某个文件夹里按内容搜索文件（只读，找到就给文件路径+行号）。用于定位代码/配置在哪。',
  parameters: {
    type: 'object',
    properties: {
      query: { type: 'string', description: '要搜的文字/关键词' },
      dir: { type: 'string', description: '从哪个文件夹搜起，可用 ~，默认主目录' }
    },
    required: ['query']
  },
  async run(args, ctx) {
    const query = String(args.query ?? '').trim()
    if (query.length === 0) return '要搜什么呢？给我个关键词'
    const sp = resolveWithinRoots(ctx.roots, String(args.dir ?? '~'))
    if (!sp.ok) return sp.reason
    const hits = await searchInDir(sp.path, query)
    return hits.length > 0 ? `找到 ${hits.length} 处：\n${hits.join('\n')}` : `没找到含「${query}」的文件`
  }
}

const fetchUrlTool: ToolModule = {
  name: 'fetch_url',
  description: '打开一个公网网址，把正文读回来（只读）。用于查资料/看文档/查报错信息。',
  parameters: {
    type: 'object',
    properties: { url: { type: 'string', description: '网址，http/https 开头' } },
    required: ['url']
  },
  async run(args) {
    const u = isUrlAllowed(String(args.url ?? ''))
    if (!u.ok) return u.reason
    try {
      const res = await fetch(u.url, {
        signal: AbortSignal.timeout(10_000),
        headers: { 'User-Agent': 'Mozilla/5.0 (compatible; LineDog/1.0)' }
      })
      if (!res.ok) return `打不开（HTTP ${res.status}）`
      const ct = res.headers.get('content-type') ?? ''
      const text = await res.text()
      const clean = ct.includes('html')
        ? text
            .replace(/<script[\s\S]*?<\/script>/gi, '')
            .replace(/<style[\s\S]*?<\/style>/gi, '')
            .replace(/<[^>]+>/g, ' ')
            .replace(/\s+/g, ' ')
            .trim()
        : text
      return truncateOutput(clean, 4000)
    } catch (e) {
      return `没访问成功：${(e as Error).message}`
    }
  }
}

/** 宽容解析 Bing 搜索结果页（b_algo 块 → 标题+摘要文本、真实网址）。纯函数、可单测。
 *  用宽容法(每块抓第一个 https 链接 + 可见文字)，抗 Bing 标记改版。 */
export function parseSearchResults(html: string, max = 5): { title: string; url: string }[] {
  const strip = (s: string): string =>
    s
      .replace(/<[^>]+>/g, ' ')
      .replace(/&amp;/g, '&')
      .replace(/&quot;/g, '"')
      .replace(/&#?\w+;/g, ' ')
      .replace(/\s+/g, ' ')
      .trim()
  const blocks = html.match(/<li class="b_algo"[\s\S]*?(?=<li class="b_algo"|<\/ol>|<\/main>|$)/g) || []
  const out: { title: string; url: string }[] = []
  const seen = new Set<string>()
  for (const b of blocks) {
    if (out.length >= max) break
    const href = /<a[^>]*href="(https?:\/\/[^"]+)"/.exec(b)
    if (!href || seen.has(href[1])) continue
    const text = strip(b).slice(0, 180)
    if (text.length === 0) continue
    seen.add(href[1])
    out.push({ title: text, url: href[1] })
  }
  return out
}

const webSearchTool: ToolModule = {
  name: 'web_search',
  description:
    '上网搜索（开放式查资料/找信息时用，如「马德里有哪些奶茶店」「这个报错怎么解决」）。' +
    '返回前几条结果的标题摘要+网址；想看某条的具体内容再用 fetch_url 打开它。',
  parameters: {
    type: 'object',
    properties: { query: { type: 'string', description: '搜索关键词/问题' } },
    required: ['query']
  },
  async run(args) {
    const q = String(args.query ?? '').trim()
    if (q.length === 0) return '要搜什么呢？给我个关键词'
    try {
      const res = await fetch(`https://www.bing.com/search?q=${encodeURIComponent(q)}&setlang=zh-CN`, {
        signal: AbortSignal.timeout(12_000),
        headers: {
          'User-Agent':
            'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0 Safari/537.36'
        }
      })
      if (!res.ok) return `搜索没成功（HTTP ${res.status}）`
      const items = parseSearchResults(await res.text(), 5)
      if (items.length === 0) return `没搜到「${q}」相关的结果`
      return items.map((it, i) => `${i + 1}. ${it.title}\n   ${it.url}`).join('\n\n')
    } catch (e) {
      return `搜索没成功：${(e as Error).message}（可能没联网或被限流）`
    }
  }
}

const writeFileTool: ToolModule = {
  name: 'write_file',
  description:
    '把内容写入一个文件（会覆盖原内容；限用户主目录范围内）。**危险操作，执行前会先问用户同不同意。**',
  danger: true,
  parameters: {
    type: 'object',
    properties: {
      path: { type: 'string', description: '文件路径，可用 ~' },
      content: { type: 'string', description: '要写入的完整内容' }
    },
    required: ['path', 'content']
  },
  prepare(args, ctx) {
    const sp = resolveWithinRoots(ctx.roots, String(args.path ?? ''))
    if (!sp.ok) return { reject: sp.reason }
    if (isSensitivePath(sp.path)) return { reject: '这是密钥/凭据类文件，出于安全我不改它' }
    const content = String(args.content ?? '')
    const preview = content.length > 300 ? `${content.slice(0, 300)}…` : content
    return { title: '写入文件', detail: `${sp.path}\n（共 ${content.length} 字，以下为预览）\n\n${preview}` }
  },
  async run(args, ctx) {
    // 确认已由 registry（danger 中央把关）做过；这里防御性复校验 + 符号链接防越界再写。
    const sp = resolveWithinRoots(ctx.roots, String(args.path ?? ''))
    if (!sp.ok) return sp.reason
    if (isSensitivePath(sp.path)) return '这是密钥/凭据类文件，出于安全我不改它'
    const content = String(args.content ?? '')
    try {
      await mkdir(dirname(sp.path), { recursive: true })
      // 符号链接可能把沙箱内路径指向外面 → 写前用 realpath 复核父目录仍在允许根内。
      // 注意根本身也 realpath（macOS /var→/private/var、/tmp→/private/tmp 都是符号链接）。
      const realParent = await realpath(dirname(sp.path)).catch(() => dirname(sp.path))
      const realRoots = await Promise.all(ctx.roots.map((r) => realpath(r).catch(() => r)))
      const within = realRoots.some((r) => realParent === r || realParent.startsWith(r + sep))
      if (!within) return '写入位置经符号链接指到了允许范围外，已拦下'
      await writeFile(sp.path, content, 'utf-8')
      ctx.audit(`write_file ${sp.path} (${content.length} 字)`)
      return `已写入 ${sp.path}`
    } catch (e) {
      return `写入失败：${(e as Error).message}`
    }
  }
}

const runCommandTool: ToolModule = {
  name: 'run_command',
  description:
    '在用户电脑上运行一条 shell 命令并把输出读回来。用于排查/修复电脑小毛病、装包、跑脚本等。' +
    '**危险操作，执行前会先问用户同不同意；明显毁电脑的命令会被直接拦下。**',
  danger: true,
  parameters: {
    type: 'object',
    properties: { command: { type: 'string', description: '要运行的命令，如 `ls -la ~/Desktop`、`node -v`' } },
    required: ['command']
  },
  prepare(args) {
    const cmd = String(args.command ?? '').trim()
    const chk = checkCommand(cmd)
    if (!chk.ok) return { reject: chk.reason }
    return { title: '运行命令', detail: cmd }
  },
  async run(args, ctx) {
    const cmd = String(args.command ?? '').trim()
    const chk = checkCommand(cmd) // 防御性复校验（确认已由 registry 做过）
    if (!chk.ok) return chk.reason
    ctx.audit(`run_command: ${cmd}`)
    try {
      const { stdout, stderr } = await execAsync(cmd, {
        cwd: ctx.roots[0] ?? homedir(),
        timeout: CMD_TIMEOUT_MS,
        maxBuffer: CMD_MAX_BUFFER,
        shell: '/bin/zsh'
      })
      const out = [stdout, stderr].filter((s) => s && s.trim().length > 0).join('\n').trim()
      return truncateOutput(out.length > 0 ? out : '（命令跑完了，没有输出）')
    } catch (e) {
      const err = e as { stdout?: string; stderr?: string; message?: string; killed?: boolean }
      if (err.killed) return '命令跑太久被我停掉了（超过 20 秒）'
      const out = [err.stdout, err.stderr, err.message].filter((s) => s && String(s).trim().length > 0).join('\n')
      return truncateOutput(`命令出错了：\n${out}`)
    }
  }
}

/** 电脑实干能力工具集（文件/网络/命令）。危险的写/跑命令带 danger 标记，由安全层兜底。 */
export const COMPUTER_TOOL_MODULES: ToolModule[] = [
  readFileTool,
  listDirTool,
  searchFilesTool,
  webSearchTool,
  fetchUrlTool,
  writeFileTool,
  runCommandTool
]
