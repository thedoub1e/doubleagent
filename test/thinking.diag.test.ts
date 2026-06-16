// 一次性诊断（gated SCENARIO_LIVE=1）：实测 MiniMax-M3 经 pi-ai 跑一轮时，
// ① model 描述符是否标 reasoning ② 流式里是否真的有 thinking_delta 数据。
// 不是回归测试，查清思考流不显示的真因后可删。
import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { runChat } from '../src/main/chat'
import type { AppConfig } from '../src/main/config'

function envKey(): string {
  try {
    const env = readFileSync(join(process.cwd(), '.env'), 'utf-8')
    const line = env.split('\n').find((l) => l.trim().startsWith('MINIMAX_API_KEY=') && l.length > 30)
    return line ? line.split('=').slice(1).join('=').trim() : ''
  } catch {
    return ''
  }
}
const KEY = envKey()
const LIVE = process.env.SCENARIO_LIVE === '1' && KEY.length > 0

function cfg(): AppConfig {
  return {
    provider: 'minimax-cn',
    model: 'MiniMax-M3',
    apiKey: KEY,
    systemPrompt: '你是小狗，用中文简洁回答。',
    supervisionEnabled: true,
    reminders: [],
    reminderList: '小狗测试_可删',
    morningBriefing: { time: '08:30', enabled: true },
    eveningBriefing: { time: '22:00', enabled: true },
    anniversaries: [],
    weatherCity: '',
    memoryModel: '',
    focusPlans: [],
    autoLaunch: false,
    dataVersion: 0,
    autoCheckUpdate: false
  }
}

describe.skipIf(!LIVE)('诊断：MiniMax-M3 思考流', () => {
  it('跑一轮需要推理的问题，统计 thinking_delta / text_delta', async () => {
    let thinkingChars = 0
    let textChars = 0
    let thinkingSample = ''
    await runChat(
      [{ role: 'user', content: '一个笼子里有鸡和兔共 35 个头、94 只脚，鸡兔各几只？简要说思路。' }],
      cfg(),
      {
        onStart: () => {},
        onDelta: (d) => {
          textChars += d.length
        },
        onThinking: (d) => {
          thinkingChars += d.length
          if (thinkingSample.length < 120) thinkingSample += d
        },
        onDone: () => {},
        onError: (m) => {
          throw new Error('chat error: ' + m)
        }
      }
    )
    // 打印实测结果（诊断用，看 stdout）
    console.log(`[诊断] thinking_delta 字符数=${thinkingChars}, text_delta 字符数=${textChars}`)
    console.log(`[诊断] thinking 样本: ${thinkingSample.slice(0, 120)}`)
    expect(textChars).toBeGreaterThan(0) // 至少要有正文回答
  }, 60000)
})
