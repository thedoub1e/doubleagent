// 剧情式验收：用纯函数模拟「多会话 + 全局共享画像」的核心承诺，测试名即一句句人话剧情。
// 跑：npx vitest run test/sessions.scenario.test.ts --reporter verbose
import { describe, expect, it } from 'vitest'
import {
  addSession,
  appendToActive,
  clearActive,
  freshStore,
  getActive,
  newSession,
  removeSession,
  setActive,
  type SessionsStore
} from '../src/main/sessionsUtil'
import { applyProfileOps, emptyProfile, renderProfile } from '../src/main/profileUtil'

const u = (c: string): { role: 'user'; content: string } => ({ role: 'user', content: c })
const a = (c: string): { role: 'assistant'; content: string } => ({ role: 'assistant', content: c })
let t = 0
const tick = (): number => (t += 1)

describe('剧情：小敏开两个会话聊不同的事', () => {
  it('【工作】会话聊项目、【减肥】会话聊饮食 —— 两边历史互不串味', () => {
    // 默认会话当作【工作】
    let store: SessionsStore = freshStore('work', tick())
    store = appendToActive(store, u('帮我盯一下周三的项目评审'), tick())
    store = appendToActive(store, a('好～我记着周三评审'), tick())

    // 新开【减肥】会话
    store = addSession(store, newSession('diet', '减肥计划', tick()))
    store = appendToActive(store, u('我在控糖，午饭只吃沙拉'), tick())
    store = appendToActive(store, a('收到，帮你盯着控糖'), tick())

    // 切回【工作】：它只看得到项目的对话，绝不混进沙拉
    store = setActive(store, 'work')
    const workText = getActive(store)!.history.map((m) => m.content).join(' ')
    expect(workText).toContain('项目评审')
    expect(workText).not.toContain('沙拉')

    // 【减肥】里只有饮食，没有项目
    store = setActive(store, 'diet')
    const dietText = getActive(store)!.history.map((m) => m.content).join(' ')
    expect(dietText).toContain('沙拉')
    expect(dietText).not.toContain('项目评审')
  })
})

describe('剧情：在一个会话说的事实，小狗在另一个会话也记得', () => {
  it('在【工作】会话说「我对花生过敏」→ 切到【减肥】会话，小狗依然知道她过敏', () => {
    // 画像是全局唯一的一份，不随会话切换
    let profile = emptyProfile()
    // 在【工作】会话里抽取到的关键事实，写进全局画像（constant=关键安全事实）
    profile = applyProfileOps(
      profile,
      [{ op: 'ADD', category: 'concern', content: '对花生过敏', confidence: 0.95, constant: true }],
      tick()
    )

    // 切到任何会话，注入给模型的画像都带着这条
    const injected = renderProfile(profile)
    expect(injected).toContain('对花生过敏')
  })
})

describe('剧情：删掉一个会话，不会伤到小狗对你的了解', () => {
  it('删除【工作】会话 → 那段对话没了，但画像里「过敏」还在', () => {
    let store: SessionsStore = freshStore('work', tick())
    store = appendToActive(store, u('随便聊聊'), tick())
    store = addSession(store, newSession('diet', '减肥计划', tick()))

    // 全局画像（独立于会话存储）
    let profile = emptyProfile()
    profile = applyProfileOps(
      profile,
      [{ op: 'ADD', category: 'concern', content: '对花生过敏', confidence: 0.95, constant: true }],
      tick()
    )

    // 删【工作】会话：只动会话存储
    store = removeSession(store, 'work')
    expect(store.sessions.map((s) => s.meta.id)).toEqual(['diet'])
    // 画像没被碰过
    expect(renderProfile(profile)).toContain('对花生过敏')
  })
})

describe('剧情：清空当前对话 ≠ 忘记你', () => {
  it('「清空对话记录」清掉当前会话的消息，但画像（对你的了解）原样保留', () => {
    let store: SessionsStore = freshStore('s', tick())
    store = appendToActive(store, u('一堆闲聊'), tick())

    let profile = emptyProfile()
    profile = applyProfileOps(
      profile,
      [{ op: 'ADD', category: 'identity', content: '在英国留学', confidence: 0.9 }],
      tick()
    )

    store = clearActive(store, tick()) // 等价于「清空对话记录」只清会话
    expect(getActive(store)!.history).toHaveLength(0)
    expect(renderProfile(profile)).toContain('在英国留学') // 画像没动
  })
})

describe('剧情：靠谱护栏', () => {
  it('极低置信的猜测（<0.3）不会被注入去误导小狗，但仍存在画像里可改', () => {
    const profile = applyProfileOps(
      emptyProfile(),
      [{ op: 'ADD', category: 'trait', content: '也许喜欢猫', inferred: true, confidence: 0.2 }],
      tick()
    )
    expect(profile.facts).toHaveLength(1) // 存着（面板能看到/能改）
    expect(renderProfile(profile)).toBe('') // 但不注入，不驱动行为
  })

  it('用户亲手改一条 → 标 constant 权威，60 条上限淘汰时也绝不被挤掉', () => {
    // 模拟 profile:update 的效果：手改 = confidence1 + 非推断 + constant
    let profile = applyProfileOps(
      emptyProfile(),
      [{ op: 'ADD', category: 'preference', content: '原值', confidence: 0.8 }],
      tick()
    )
    const id = profile.facts[0].id
    profile = applyProfileOps(
      profile,
      [{ op: 'UPDATE', id, content: '用户手改的正确值', confidence: 1, inferred: false, constant: true }],
      tick()
    )
    // 灌满 60 条新事实触发淘汰
    const flood = Array.from({ length: 65 }, (_, i) => ({
      op: 'ADD' as const,
      category: 'concern' as const,
      content: `噪音${i}`,
      confidence: 0.8
    }))
    profile = applyProfileOps(profile, flood, tick())
    expect(profile.facts.some((f) => f.content === '用户手改的正确值')).toBe(true) // 权威事实活下来
  })
})
