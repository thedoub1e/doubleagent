// 能力工具集成测试：真临时目录 + 桩 confirm/audit，验证沙箱/确认/危险拦截/审计落实。
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync, mkdirSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { COMPUTER_TOOL_MODULES, parseSearchResults } from '../src/main/tools/computerTools'
import { createRegistry } from '../src/main/tools/registry'
import type { ToolContext, ToolModule } from '../src/main/tools/types'

const tool = (name: string): ToolModule => {
  const m = COMPUTER_TOOL_MODULES.find((x) => x.name === name)
  if (!m) throw new Error(`no tool ${name}`)
  return m
}

let dir = ''
let audited: string[] = []
const ctxWith = (confirm: boolean): ToolContext => ({
  reminderList: 'x',
  startFocus: () => {},
  stopFocus: () => {},
  roots: [dir],
  confirm: async () => confirm,
  audit: (e) => audited.push(e)
})

// 危险工具走 registry 中央把关（prepare 预校验 → 确认 → run），与生产一致。
const reg = (): ReturnType<typeof createRegistry> => createRegistry(COMPUTER_TOOL_MODULES)
const dispatchOne = async (
  name: string,
  args: Record<string, unknown>,
  ctx: ToolContext
): Promise<string> => {
  const res = await reg().dispatch([{ id: 'c1', name, arguments: args } as never], ctx)
  return res[0].text
}

beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), 'da-tools-'))
  audited = []
})
afterEach(() => rmSync(dir, { recursive: true, force: true }))

describe('read_file', () => {
  it('读到沙箱内文件内容', async () => {
    writeFileSync(join(dir, 'a.txt'), '你好世界', 'utf-8')
    const out = await tool('read_file').run({ path: join(dir, 'a.txt') }, ctxWith(true))
    expect(out).toBe('你好世界')
  })
  it('拒绝沙箱外路径', async () => {
    const out = await tool('read_file').run({ path: '/etc/passwd' }, ctxWith(true))
    expect(out).toContain('超出允许范围')
  })
  it('对文件夹建议用 list_dir', async () => {
    const out = await tool('read_file').run({ path: dir }, ctxWith(true))
    expect(out).toContain('list_dir')
  })
})

describe('list_dir', () => {
  it('列出文件与子文件夹(夹带 /)', async () => {
    writeFileSync(join(dir, 'f.txt'), 'x')
    mkdirSync(join(dir, 'sub'))
    const out = await tool('list_dir').run({ path: dir }, ctxWith(true))
    expect(out).toContain('f.txt')
    expect(out).toContain('sub/')
  })
})

describe('search_files', () => {
  it('按内容搜到文件+行号', async () => {
    writeFileSync(join(dir, 'note.txt'), '第一行\n含有关键词TOKEN在这\n第三行', 'utf-8')
    const out = await tool('search_files').run({ query: 'TOKEN', dir }, ctxWith(true))
    expect(out).toContain('note.txt:2')
  })
  it('搜不到给友好提示', async () => {
    const out = await tool('search_files').run({ query: '不存在的词', dir }, ctxWith(true))
    expect(out).toContain('没找到')
  })
})

describe('write_file（危险→registry 中央确认把关）', () => {
  it('确认通过→写入并审计', async () => {
    const p = join(dir, 'out.txt')
    const out = await dispatchOne('write_file', { path: p, content: 'hello' }, ctxWith(true))
    expect(out).toContain('已写入')
    expect(readFileSync(p, 'utf-8')).toBe('hello')
    expect(audited.some((e) => e.includes('write_file'))).toBe(true)
  })
  it('确认拒绝→不写、不审计', async () => {
    const p = join(dir, 'no.txt')
    const out = await dispatchOne('write_file', { path: p, content: 'hello' }, ctxWith(false))
    expect(out).toContain('没同意')
    expect(existsSync(p)).toBe(false)
    expect(audited.length).toBe(0)
  })
  it('沙箱外在 prepare 阶段就拒绝(不弹确认)', async () => {
    const confirm = vi.fn(async () => true)
    const out = await dispatchOne('write_file', { path: '/etc/evil.txt', content: 'x' }, {
      ...ctxWith(true),
      confirm
    })
    expect(out).toContain('超出允许范围')
    expect(confirm).not.toHaveBeenCalled() // 越界根本不该问
  })
  it('密钥类文件在 prepare 阶段就拒绝', async () => {
    const confirm = vi.fn(async () => true)
    const out = await dispatchOne('write_file', { path: join(dir, '.ssh/id_rsa'), content: 'x' }, {
      ...ctxWith(true),
      confirm
    })
    expect(out).toContain('密钥')
    expect(confirm).not.toHaveBeenCalled()
  })
})

describe('run_command（危险→registry 中央确认 + 黑名单）', () => {
  it('确认通过→执行并拿到输出 + 审计', async () => {
    const out = await dispatchOne('run_command', { command: 'echo 线条小狗' }, ctxWith(true))
    expect(out).toContain('线条小狗')
    expect(audited.some((e) => e.includes('run_command'))).toBe(true)
  })
  it('确认拒绝→不执行、不审计', async () => {
    const out = await dispatchOne('run_command', { command: 'echo nope' }, ctxWith(false))
    expect(out).toContain('没同意')
    expect(audited.length).toBe(0)
  })
  it('危险命令在 prepare 阶段就被拦死(不弹确认)', async () => {
    const confirm = vi.fn(async () => true)
    for (const bad of ['rm -rf /', 'rm -r -f ~', 'sudo rm x', ':(){ :|:& };:']) {
      audited = []
      const out = await dispatchOne('run_command', { command: bad }, { ...ctxWith(true), confirm })
      expect(out, bad).toContain('危险操作')
    }
    expect(confirm).not.toHaveBeenCalled()
    expect(audited.length).toBe(0)
  })
})

describe('parseSearchResults (Bing 宽容解析)', () => {
  const sample =
    '<ol id="b_results">' +
    '<li class="b_algo"><h2><a href="https://a.com/1">标题甲</a></h2><p>摘要甲内容</p></li>' +
    '<li class="b_algo"><div><a href="https://b.com/2">标题乙</a></div><p>摘要乙</p></li>' +
    '<li class="b_algo"><a href="https://a.com/1">重复链接应去重</a></li>' +
    '</ol>'
  it('抓出每块的标题文本+真实网址，去重', () => {
    const r = parseSearchResults(sample, 5)
    expect(r.length).toBe(2) // 第三块 url 重复被去掉
    expect(r[0].url).toBe('https://a.com/1')
    expect(r[0].title).toContain('标题甲')
    expect(r[1].url).toBe('https://b.com/2')
  })
  it('空/无结果页返回空数组', () => {
    expect(parseSearchResults('<html>no results</html>')).toEqual([])
  })
})

describe('read_file 安全', () => {
  it('拒绝读密钥类文件', async () => {
    const out = await tool('read_file').run({ path: join(dir, '.ssh/id_rsa') }, ctxWith(true))
    expect(out).toContain('密钥')
  })
})

describe('fetch_url（SSRF 闸）', () => {
  it('挡掉本机/内网地址(不发请求)', async () => {
    const out = await tool('fetch_url').run({ url: 'http://127.0.0.1:8080/x' }, ctxWith(true))
    expect(out).toContain('内网')
  })
  it('挡掉非 http 协议', async () => {
    const out = await tool('fetch_url').run({ url: 'file:///etc/passwd' }, ctxWith(true))
    expect(out).toContain('http')
  })
})
