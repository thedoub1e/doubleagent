// set_briefing 工具：对话改早安/晚安简报时间与开关。electron app.getPath mock 到临时目录，真读真写 config.json。
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

let dir = ''
vi.mock('electron', () => ({ app: { getPath: (): string => dir } }))

beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), 'da-briefing-'))
  vi.resetModules()
})
afterEach(() => {
  rmSync(dir, { recursive: true, force: true })
})

type PetMod = typeof import('../src/main/tools/petTools')
type ConfigMod = typeof import('../src/main/config')
const load = async (): Promise<{ pet: PetMod; cfg: ConfigMod }> => ({
  pet: await import('../src/main/tools/petTools'),
  cfg: await import('../src/main/config')
})
const ctx = { reminderList: '测试', startFocus: () => {}, stopFocus: () => {} } as never

const getTool = (pet: PetMod) => {
  const t = pet.PET_TOOL_MODULES.find((m) => m.name === 'set_briefing')
  if (!t) throw new Error('set_briefing 未注册')
  return t
}

describe('set_briefing 注册', () => {
  it('已注册进生活工具集', async () => {
    const { pet } = await load()
    expect(pet.PET_TOOL_MODULES.some((t) => t.name === 'set_briefing')).toBe(true)
  })
})

describe('set_briefing 改时间', () => {
  it('morning 改时间 → 落盘 morningBriefing.time', async () => {
    const { pet, cfg } = await load()
    const out = await getTool(pet).run({ which: 'morning', time: '07:15' }, ctx)
    expect(String(out)).toContain('07:15')
    expect(cfg.loadConfig().morningBriefing.time).toBe('07:15')
    expect(cfg.loadConfig().morningBriefing.enabled).toBe(true) // 沿用原开关
  })

  it('evening 关闭 → enabled=false，时间保留', async () => {
    const { pet, cfg } = await load()
    const before = cfg.loadConfig().eveningBriefing.time
    const out = await getTool(pet).run({ which: 'evening', enabled: false }, ctx)
    expect(String(out)).toContain('关')
    expect(cfg.loadConfig().eveningBriefing.enabled).toBe(false)
    expect(cfg.loadConfig().eveningBriefing.time).toBe(before)
  })
})

describe('set_briefing 输入校验', () => {
  it('which 非法 → 友好提示，不落盘', async () => {
    const { pet } = await load()
    const out = await getTool(pet).run({ which: '随便' }, ctx)
    expect(String(out)).toContain('morning')
  })

  it('时间格式非法 → 友好提示', async () => {
    const { pet } = await load()
    const out = await getTool(pet).run({ which: 'morning', time: '乱写' }, ctx)
    expect(String(out)).toContain('HH:MM')
  })

  it('既不给时间也不给开关 → 提示', async () => {
    const { pet } = await load()
    const out = await getTool(pet).run({ which: 'morning' }, ctx)
    expect(String(out)).toContain('时间')
  })

  it('归一化时间：8:5 → 08:05', async () => {
    const { pet, cfg } = await load()
    await getTool(pet).run({ which: 'morning', time: '8:5' }, ctx)
    expect(cfg.loadConfig().morningBriefing.time).toBe('08:05')
  })
})
