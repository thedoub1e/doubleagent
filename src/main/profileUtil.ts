// 纯函数（无 electron / 无 IO）：结构化用户画像的合并与渲染。可单测。
// 设计取自 Mem0/LangMem：离散 typed facts + ADD/UPDATE/DELETE/NOOP，LLM 决定 op；
// 矛盾走 UPDATE 覆盖（避 mem0 DELETE-on-contradiction 把槽位删空的 #1 bug），DELETE 只给明确撤回。

export type FactCategory = 'identity' | 'preference' | 'concern' | 'commitment' | 'trait'
//                          身份        喜好          在意的事     约定          性格(多为推断)
export type FactType = 'world' | 'experience' | 'opinion' // 世界事实/经历/观点 → 决定可变性

export interface ProfileFact {
  id: string
  category: FactCategory
  content: string
  inferred: boolean // 是否为推断（非用户明说）
  factType: FactType
  confidence: number // 0..1
  supersedes?: string // UPDATE 时存旧值，供面板撤销 + 审计
  constant?: boolean // 总注入 + 永不被上限淘汰（如"对花生过敏"这类关键事实）
  createdAt: number
  updatedAt: number
}

export interface UserProfile {
  facts: ProfileFact[]
  updatedAt: number
}

export type ProfileOp =
  | {
      op: 'ADD'
      category: FactCategory
      content: string
      inferred?: boolean
      factType?: FactType
      confidence?: number
      constant?: boolean
    }
  | {
      op: 'UPDATE'
      id: string
      content?: string
      category?: FactCategory
      inferred?: boolean
      factType?: FactType
      confidence?: number
      constant?: boolean
    }
  | { op: 'DELETE'; id: string }
  | { op: 'NOOP' }

export const MAX_FACTS = 60
const DEFAULT_CONFIDENCE = 0.8
const LOW_CONFIDENCE = 0.5
// 靠谱护栏：confidence 低于此值的事实「不主动注入、不驱动行为」（面板仍可见/可改）。
// constant(关键安全事实如过敏) 不受此限，永远注入。
export const INJECT_MIN_CONFIDENCE = 0.3
// 注入预算：单次注入人设的事实条数上限。画像随使用长大后，全量注入会稀释模型注意力、
// 抬高 token；超额时按优先级取 top-N（constant 永远保留），既省 token 又聚焦最重要的事。
export const INJECT_MAX_FACTS = 24

export function emptyProfile(): UserProfile {
  return { facts: [], updatedAt: 0 }
}

// 超上限淘汰：constant 永不淘汰；其余按 updatedAt 旧的先淘汰。
function evict(facts: ProfileFact[], max: number): ProfileFact[] {
  if (facts.length <= max) return facts
  const constants = facts.filter((f) => f.constant)
  const rest = facts.filter((f) => !f.constant).sort((a, b) => b.updatedAt - a.updatedAt) // 新→旧
  const keepRest = rest.slice(0, Math.max(0, max - constants.length))
  return [...constants, ...keepRest]
}

/** 把 LLM 给的操作列表合并进画像，返回新画像（不可变，绝不改入参）。 */
export function applyProfileOps(
  profile: UserProfile,
  ops: readonly ProfileOp[],
  now: number
): UserProfile {
  let facts = profile.facts.slice()
  let changed = false
  let seq = 0

  for (const op of ops) {
    if (op.op === 'ADD') {
      facts = [
        ...facts,
        {
          id: `${now}-${seq++}`,
          category: op.category,
          content: op.content,
          inferred: op.inferred ?? false,
          factType: op.factType ?? 'world',
          confidence: op.confidence ?? DEFAULT_CONFIDENCE,
          constant: op.constant,
          createdAt: now,
          updatedAt: now
        }
      ]
      changed = true
    } else if (op.op === 'UPDATE') {
      const idx = facts.findIndex((f) => f.id === op.id)
      if (idx === -1) continue
      const old = facts[idx]
      const contentChanged = op.content !== undefined && op.content !== old.content
      const updated: ProfileFact = {
        ...old,
        ...(op.content !== undefined ? { content: op.content } : {}),
        ...(op.category !== undefined ? { category: op.category } : {}),
        ...(op.inferred !== undefined ? { inferred: op.inferred } : {}),
        ...(op.factType !== undefined ? { factType: op.factType } : {}),
        ...(op.confidence !== undefined ? { confidence: op.confidence } : {}),
        ...(op.constant !== undefined ? { constant: op.constant } : {}),
        ...(contentChanged ? { supersedes: old.content } : {}),
        updatedAt: now
      }
      facts = facts.map((f, i) => (i === idx ? updated : f))
      changed = true
    } else if (op.op === 'DELETE') {
      const before = facts.length
      facts = facts.filter((f) => f.id !== op.id)
      if (facts.length !== before) changed = true
    }
    // NOOP / 未知 op：忽略
  }

  facts = evict(facts, MAX_FACTS)
  return { facts, updatedAt: changed ? now : profile.updatedAt }
}

const CATEGORY_LABELS: Record<FactCategory, string> = {
  identity: '身份',
  preference: '喜好',
  concern: '在意的事',
  commitment: '约定',
  trait: '性格'
}
const CATEGORY_ORDER: FactCategory[] = ['identity', 'preference', 'concern', 'commitment', 'trait']

/** 一条事实是否参与注入：constant 永远注入；其余须 confidence ≥ 注入门槛（低置信不驱动行为）。 */
function isInjectable(f: ProfileFact): boolean {
  return Boolean(f.constant) || f.confidence >= INJECT_MIN_CONFIDENCE
}

// 注入优先级打分：constant 最高，其次「用户明说(非推断)」，再次高置信。近期度做 sort 的次级 tiebreak。
function injectPriority(f: ProfileFact): number {
  let score = f.confidence // 0..1
  if (!f.inferred) score += 10 // 明确陈述 > 推断
  return score
}

/**
 * 注入预算：可注入事实超过 max 时，按优先级取 top-N（constant 永远保留，不占名额上限语义但优先纳入）。
 * 返回的事实保持在 profile.facts 里的原始顺序，渲染稳定。纯函数。
 */
export function selectInjectableFacts(profile: UserProfile, max = INJECT_MAX_FACTS): ProfileFact[] {
  const injectable = profile.facts.filter(isInjectable)
  if (injectable.length <= max) return injectable
  const constants = injectable.filter((f) => f.constant)
  const rest = injectable.filter((f) => !f.constant)
  const slots = Math.max(0, max - constants.length)
  const rankedRest = rest
    .slice()
    .sort((a, b) => injectPriority(b) - injectPriority(a) || b.updatedAt - a.updatedAt)
    .slice(0, slots)
  const keep = new Set<ProfileFact>([...constants, ...rankedRest])
  return injectable.filter((f) => keep.has(f)) // 原始顺序
}

/** 把画像渲染成注入人设的文本（按分类分组；推断/低置信标「推测」；极低置信不注入；超预算取 top-N）。空→空串。 */
export function renderProfile(profile: UserProfile, max = INJECT_MAX_FACTS): string {
  const injectable = selectInjectableFacts(profile, max)
  if (injectable.length === 0) return ''
  const lines: string[] = []
  for (const cat of CATEGORY_ORDER) {
    const fs = injectable.filter((f) => f.category === cat)
    if (fs.length === 0) continue
    lines.push(`【${CATEGORY_LABELS[cat]}】`)
    for (const f of fs) {
      const tag = f.inferred || f.confidence < LOW_CONFIDENCE ? '（推测）' : ''
      lines.push(`· ${f.content}${tag}`)
    }
  }
  return lines.join('\n')
}
