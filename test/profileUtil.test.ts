import { describe, expect, test } from 'vitest'
import {
  applyProfileOps,
  emptyProfile,
  renderProfile,
  selectInjectableFacts,
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

  test('靠谱护栏：极低置信(<0.3)事实不注入', () => {
    const p = {
      facts: [fact({ id: '1', category: 'trait', content: '也许喜欢猫', inferred: true, confidence: 0.2 })],
      updatedAt: 1
    }
    expect(renderProfile(p)).toBe('') // 被注入门槛过滤
  })

  test('靠谱护栏：constant 关键事实即便低置信也始终注入', () => {
    const p = {
      facts: [fact({ id: '1', category: 'concern', content: '对花生过敏', confidence: 0.1, constant: true })],
      updatedAt: 1
    }
    expect(renderProfile(p)).toContain('对花生过敏')
  })
})

describe('selectInjectableFacts — 注入预算 top-N', () => {
  test('未超预算时全量返回（保持原始顺序）', () => {
    const p = {
      facts: [fact({ id: 'a' }), fact({ id: 'b' }), fact({ id: 'c' })],
      updatedAt: 1
    }
    expect(selectInjectableFacts(p, 24).map((f) => f.id)).toEqual(['a', 'b', 'c'])
  })

  test('超预算时按优先级取 top-N：明说>推断、高置信优先', () => {
    const facts: ProfileFact[] = [
      fact({ id: 'inferLow', inferred: true, confidence: 0.4 }),
      fact({ id: 'explicitHigh', inferred: false, confidence: 0.9 }),
      fact({ id: 'explicitMid', inferred: false, confidence: 0.6 })
    ]
    const chosen = selectInjectableFacts({ facts, updatedAt: 1 }, 2).map((f) => f.id)
    expect(chosen).toContain('explicitHigh')
    expect(chosen).toContain('explicitMid')
    expect(chosen).not.toContain('inferLow') // 推断+低置信被预算挤掉
  })

  test('constant 永远纳入，即使预算很小且置信很低', () => {
    const facts: ProfileFact[] = [
      fact({ id: 'allergy', category: 'concern', content: '过敏', confidence: 0.1, constant: true }),
      fact({ id: 'x', inferred: false, confidence: 0.9 }),
      fact({ id: 'y', inferred: false, confidence: 0.85 })
    ]
    const chosen = selectInjectableFacts({ facts, updatedAt: 1 }, 1).map((f) => f.id)
    expect(chosen).toContain('allergy')
  })

  test('近期度做次级 tiebreak：同优先级下较新者优先', () => {
    const facts: ProfileFact[] = [
      fact({ id: 'old', inferred: false, confidence: 0.8, updatedAt: 10 }),
      fact({ id: 'new', inferred: false, confidence: 0.8, updatedAt: 99 })
    ]
    const chosen = selectInjectableFacts({ facts, updatedAt: 1 }, 1).map((f) => f.id)
    expect(chosen).toEqual(['new'])
  })

  test('renderProfile 受预算约束：超额时只渲染 top-N', () => {
    const facts: ProfileFact[] = [
      fact({ id: 'keep', category: 'identity', content: '在马德里留学', inferred: false, confidence: 0.95 }),
      fact({ id: 'drop', category: 'trait', content: '也许喜欢安静', inferred: true, confidence: 0.4 })
    ]
    const out = renderProfile({ facts, updatedAt: 1 }, 1)
    expect(out).toContain('在马德里留学')
    expect(out).not.toContain('也许喜欢安静')
  })
})
