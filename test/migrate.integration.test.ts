// 集成测试：驱动真实 runDataMigrations（fs + config 落盘）。electron app.getPath mock 到临时 userData。
// 覆盖当前真实路径：无已注册迁移时，把 dataVersion 归正到 CURRENT、不建备份、重复调用幂等。
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

let dir = ''
vi.mock('electron', () => ({ app: { getPath: (): string => dir } }))

beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), 'da-mig-int-'))
  vi.resetModules()
})
afterEach(() => rmSync(dir, { recursive: true, force: true }))

const load = (): Promise<typeof import('../src/main/migrate')> => import('../src/main/migrate')
const loadConfigMod = (): Promise<typeof import('../src/main/config')> => import('../src/main/config')
const configPath = (): string => join(dir, 'config.json')

describe('runDataMigrations（无已注册迁移＝当前真实状态）', () => {
  it('全新（无 config）→ dataVersion 归正到 CURRENT，不建备份', async () => {
    const { runDataMigrations, CURRENT_DATA_VERSION } = await load()
    const res = runDataMigrations()
    expect(res.ran).toBe(0)
    expect(res.backedUp).toBe(false)
    expect(existsSync(join(dir, 'backup'))).toBe(false) // 无迁移→不备份
    const cfg = JSON.parse(readFileSync(configPath(), 'utf-8'))
    expect(cfg.dataVersion).toBe(CURRENT_DATA_VERSION)
  })

  it('旧 dataVersion=0 → 升到 CURRENT（无迁移，仅归正版本号）', async () => {
    writeFileSync(configPath(), JSON.stringify({ dataVersion: 0, model: 'X' }), 'utf-8')
    const { runDataMigrations, CURRENT_DATA_VERSION } = await load()
    runDataMigrations()
    const { loadConfig } = await loadConfigMod()
    expect(loadConfig().dataVersion).toBe(CURRENT_DATA_VERSION)
    expect(loadConfig().model).toBe('X') // 不动其它字段
  })

  it('已是 CURRENT → 幂等，什么都不做', async () => {
    const { CURRENT_DATA_VERSION } = await load()
    writeFileSync(configPath(), JSON.stringify({ dataVersion: CURRENT_DATA_VERSION }), 'utf-8')
    vi.resetModules()
    const { runDataMigrations } = await load()
    const res = runDataMigrations()
    expect(res.ran).toBe(0)
    expect(res.backedUp).toBe(false)
    expect(existsSync(join(dir, 'backup'))).toBe(false)
  })
})
