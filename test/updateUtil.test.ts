import { describe, expect, test } from 'vitest'
import {
  describeUpdate,
  friendlyUpdateError,
  isUpdateAvailable,
  isWorkingTreeClean,
  needsNpmInstall,
  parseBehindCount,
  parseBranch,
  parseChangedFiles,
  parseSha
} from '../src/main/updateUtil'

describe('parseSha', () => {
  test('取首行去空白', () => {
    expect(parseSha('  abc123\n')).toBe('abc123')
    expect(parseSha('abc123\ndef456')).toBe('abc123')
  })
  test('空输入 → 空串', () => {
    expect(parseSha('')).toBe('')
    expect(parseSha('   \n')).toBe('')
  })
})

describe('parseBehindCount', () => {
  test('解析落后提交数', () => {
    expect(parseBehindCount('3\n')).toBe(3)
    expect(parseBehindCount('0')).toBe(0)
  })
  test('非法 → 0', () => {
    expect(parseBehindCount('abc')).toBe(0)
    expect(parseBehindCount('')).toBe(0)
    expect(parseBehindCount('-2')).toBe(0)
  })
})

describe('parseBranch', () => {
  test('正常分支名', () => {
    expect(parseBranch('main\n')).toBe('main')
    expect(parseBranch('feature/x')).toBe('feature/x')
  })
  test('detached/空 → main 兜底', () => {
    expect(parseBranch('HEAD')).toBe('main')
    expect(parseBranch('')).toBe('main')
  })
})

describe('isUpdateAvailable', () => {
  test('sha 不同且落后 → 有更新', () => {
    expect(isUpdateAvailable('aaa', 'bbb', 2)).toBe(true)
  })
  test('相同 sha / 不落后 / 缺 sha → 无更新', () => {
    expect(isUpdateAvailable('aaa', 'aaa', 0)).toBe(false)
    expect(isUpdateAvailable('aaa', 'bbb', 0)).toBe(false)
    expect(isUpdateAvailable('', 'bbb', 2)).toBe(false)
    expect(isUpdateAvailable('aaa', '', 2)).toBe(false)
  })
})

describe('parseChangedFiles', () => {
  test('拆成文件名数组、去空行', () => {
    expect(parseChangedFiles('a.ts\n b.ts \n\nc.ts')).toEqual(['a.ts', 'b.ts', 'c.ts'])
  })
  test('空 → 空数组', () => {
    expect(parseChangedFiles('')).toEqual([])
  })
})

describe('needsNpmInstall', () => {
  test('含 package-lock.json / package.json → 需要装依赖', () => {
    expect(needsNpmInstall(['src/a.ts', 'package-lock.json'])).toBe(true)
    expect(needsNpmInstall(['package.json'])).toBe(true)
  })
  test('只改源码 → 不需要', () => {
    expect(needsNpmInstall(['src/main/index.ts', 'README.md'])).toBe(false)
    expect(needsNpmInstall([])).toBe(false)
  })
})

describe('isWorkingTreeClean', () => {
  test('porcelain 空 → 干净', () => {
    expect(isWorkingTreeClean('')).toBe(true)
    expect(isWorkingTreeClean('   \n')).toBe(true)
  })
  test('有改动 → 不干净', () => {
    expect(isWorkingTreeClean(' M src/a.ts')).toBe(false)
  })
})

describe('describeUpdate', () => {
  test('有更新 → 含「新版本」且不暴露 git 术语', () => {
    const s = describeUpdate(3)
    expect(s).toContain('新版本')
    expect(s).not.toMatch(/commit|sha|branch/i)
  })
  test('无更新 → 最新版文案', () => {
    expect(describeUpdate(0)).toContain('最新版')
  })
})

describe('friendlyUpdateError', () => {
  test('ENOENT → 没找到 git/npm', () => {
    expect(friendlyUpdateError('spawn git ENOENT')).toContain('没找到')
  })
  test('网络 → 网络提示', () => {
    expect(friendlyUpdateError('could not resolve host github.com')).toContain('网络')
  })
  test('非 git 仓库 → clone 提示', () => {
    expect(friendlyUpdateError('fatal: not a git repository')).toContain('clone')
  })
  test('快进失败 → 不强更提示', () => {
    expect(friendlyUpdateError('fatal: Not possible to fast-forward, aborting.')).toContain('对不上')
  })
  test('兜底 → 通用友好语 + 保证记录安全', () => {
    expect(friendlyUpdateError('weird unknown error')).toContain('记录')
  })
})
