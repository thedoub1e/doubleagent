import { describe, expect, test } from 'vitest'
import { pendingMigrations, type Migration } from '../src/main/migrate'

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
