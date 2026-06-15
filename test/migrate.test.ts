import { afterEach, beforeEach, describe, expect, test } from 'vitest'
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { backupUserData, pendingMigrations, type Migration } from '../src/main/migrate'

const mig = (version: number): Migration => ({
  version,
  describe: `m${version}`,
  run: () => {}
})

describe('pendingMigrations', () => {
  test('只取 stored < version <= target 的迁移，按版本升序', () => {
    const all = [mig(3), mig(1), mig(2), mig(4)]
    const out = pendingMigrations(1, all, 3).map((m) => m.version)
    expect(out).toEqual([2, 3])
  })

  test('已是最新 → 空', () => {
    expect(pendingMigrations(3, [mig(1), mig(2), mig(3)], 3)).toEqual([])
  })

  test('无已注册迁移 → 空（框架就绪、零迁移也安全）', () => {
    expect(pendingMigrations(0, [], 1)).toEqual([])
  })

  test('不包含 > target 的迁移（不越级跑未来迁移）', () => {
    const out = pendingMigrations(0, [mig(1), mig(2), mig(5)], 2).map((m) => m.version)
    expect(out).toEqual([1, 2])
  })
})

describe('backupUserData（迁移前备份关键记录）', () => {
  let dir = ''
  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), 'da-mig-'))
  })
  afterEach(() => rmSync(dir, { recursive: true, force: true }))

  test('把存在的记录文件复制进 backup/pre-v<target>/，内容一致', () => {
    writeFileSync(join(dir, 'profile.json'), '{"facts":[{"id":"x"}]}', 'utf-8')
    writeFileSync(join(dir, 'sessions.json'), '{"sessions":[]}', 'utf-8')
    const ok = backupUserData(dir, 2)
    expect(ok).toBe(true)
    const backupDir = join(dir, 'backup', 'pre-v2')
    expect(existsSync(join(backupDir, 'profile.json'))).toBe(true)
    expect(readFileSync(join(backupDir, 'profile.json'), 'utf-8')).toContain('"x"')
    expect(existsSync(join(backupDir, 'sessions.json'))).toBe(true)
  })

  test('缺失的记录文件直接跳过，不报错', () => {
    // 只有 config.json，其余记录文件不存在
    writeFileSync(join(dir, 'config.json'), '{"dataVersion":0}', 'utf-8')
    const ok = backupUserData(dir, 1)
    expect(ok).toBe(true)
    expect(existsSync(join(dir, 'backup', 'pre-v1', 'config.json'))).toBe(true)
    expect(existsSync(join(dir, 'backup', 'pre-v1', 'profile.json'))).toBe(false) // 不存在的不创建
  })
})
