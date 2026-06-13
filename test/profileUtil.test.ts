import { describe, expect, test } from 'vitest'
import {
  applyProfileOps,
  emptyProfile,
  renderProfile,
  type ProfileFact,
  type ProfileOp
} from '../src/main/profileUtil'

const NOW = 1_000

const fact = (over: Partial<ProfileFact> = {}): ProfileFact => ({
  id: 'f1',
  category: 'preference',
  content: '喜欢喝燕麦拿铁',
  inferred: false,
  factType: 'opinion',
  confidence: 0.9,
  createdAt: 1,
  updatedAt: 1,
  ...over
})

describe('applyProfileOps — ADD', () => {
  test('adds a new fact with generated id + timestamps', () => {
    const next = applyProfileOps(emptyProfile(), [
      { op: 'ADD', category: 'identity', content: '在英国留学', inferred: false, factType: 'world' }
    ], NOW)
    expect(next.facts).toHaveLength(1)
    const f = next.facts[0]
    expect(f.content).toBe('在英国留学')
    expect(f.category).toBe('identity')
    expect(f.id).toBeTruthy()
    expect(f.createdAt).toBe(NOW)
    expect(f.updatedAt).toBe(NOW)
  })

  test('NOOP / unknown op leaves profile unchanged', () => {
    const before = { facts: [fact()], updatedAt: 1 }
    const after = applyProfileOps(before, [{ op: 'NOOP' } as ProfileOp], NOW)
    expect(after.facts).toHaveLength(1)
  })
})

describe('applyProfileOps — UPDATE (supersede, no DELETE on contradiction)', () => {
  test('UPDATE keeps id, fills supersedes with old content, bumps updatedAt', () => {
    const before = { facts: [fact({ id: 'x', content: '喜欢喝燕麦拿铁' })], updatedAt: 1 }
    const after = applyProfileOps(before, [
      { op: 'UPDATE', id: 'x', content: '现在更喜欢美式' }
    ], NOW)
    expect(after.facts).toHaveLength(1)
    const f = after.facts[0]
    expect(f.id).toBe('x')
    expect(f.content).toBe('现在更喜欢美式')
    expect(f.supersedes).toBe('喜欢喝燕麦拿铁')
    expect(f.updatedAt).toBe(NOW)
    expect(f.createdAt).toBe(1) // createdAt preserved
  })

  test('UPDATE on missing id is ignored (no crash, no add)', () => {
    const before = { facts: [fact({ id: 'x' })], updatedAt: 1 }
    const after = applyProfileOps(before, [{ op: 'UPDATE', id: 'nope', content: 'y' }], NOW)
    expect(after.facts).toHaveLength(1)
    expect(after.facts[0].content).toBe('喜欢喝燕麦拿铁')
  })
})

describe('applyProfileOps — DELETE (explicit retraction only)', () => {
  test('removes the fact by id', () => {
    const before = { facts: [fact({ id: 'a' }), fact({ id: 'b', content: '住曼城' })], updatedAt: 1 }
    const after = applyProfileOps(before, [{ op: 'DELETE', id: 'a' }], NOW)
    expect(after.facts.map((f) => f.id)).toEqual(['b'])
  })
})

describe('applyProfileOps — immutability', () => {
  test('does not mutate the input profile or its facts', () => {
    const before = { facts: [fact({ id: 'x', content: 'orig' })], updatedAt: 1 }
    const snapshot = JSON.parse(JSON.stringify(before))
    applyProfileOps(before, [{ op: 'UPDATE', id: 'x', content: 'changed' }], NOW)
    expect(before).toEqual(snapshot)
  })
})

describe('applyProfileOps — cap eviction', () => {
  test('keeps at most MAX facts, evicting the oldest-updated first (constant survives)', () => {
    // build 61 facts; the constant one is the oldest but must survive eviction
    const facts: ProfileFact[] = []
    facts.push(fact({ id: 'keep', content: '过敏花生', constant: true, updatedAt: 1 }))
    for (let i = 0; i < 60; i++) facts.push(fact({ id: `n${i}`, updatedAt: 100 + i }))
    const before = { facts, updatedAt: 1 }
    const after = applyProfileOps(before, [
      { op: 'ADD', category: 'concern', content: '新事项', inferred: false, factType: 'world' }
    ], NOW)
    expect(after.facts.length).toBeLessThanOrEqual(60)
    expect(after.facts.some((f) => f.id === 'keep')).toBe(true) // constant never evicted
  })
})

describe('renderProfile', () => {
  test('groups by category with Chinese labels; empty → empty string', () => {
    expect(renderProfile(emptyProfile())).toBe('')
    const p = {
      facts: [
        fact({ id: '1', category: 'identity', content: '在英国留学' }),
        fact({ id: '2', category: 'preference', content: '爱喝拿铁' })
      ],
      updatedAt: 1
    }
    const out = renderProfile(p)
    expect(out).toContain('在英国留学')
    expect(out).toContain('爱喝拿铁')
    expect(out).toContain('身份')
    expect(out).toContain('喜好')
  })

  test('low-confidence inferred facts are marked', () => {
    const p = {
      facts: [fact({ id: '1', category: 'trait', content: '可能内向', inferred: true, confidence: 0.4 })],
      updatedAt: 1
    }
    expect(renderProfile(p)).toContain('推测')
  })
})
