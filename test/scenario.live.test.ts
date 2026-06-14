// 场景测试（真实模型，沙盒）：驱动真 runChat + 真 PET_TOOLS + 真 MiniMax，
// 但工具执行用桩（返回假结果），不触碰真实提醒事项 / 配置 / OS。
// 默认 vitest run 跳过（避免联网）；显式跑：SCENARIO_LIVE=1 npx vitest run test/scenario.live.test.ts
import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { runChat, type ToolResult } from '../src/main/chat'
import { ALL_TOOLS } from '../src/main/tools/index'
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

// 镜像 index.ts todayHint 的工具路由指令（场景测试需与生产一致）。
function hint(now: Date): string {
  const y = now.getFullYear()
  const m = now.getMonth() + 1
  const d = now.getDate()
  const hh = String(now.getHours()).padStart(2, '0')
  const mi = String(now.getMinutes()).padStart(2, '0')
  return (
    `\n\n【现在】${y}-${m}-${d} ${hh}:${mi}。\n` +
    '【主动无感用工具，不必等用户说帮我记一下】：\n' +
    '· 要做的事/截止/约会 → create_reminder（dueISO 本地时间，相对日期据「现在」推算）。\n' +
    '· 做完了某事 → complete_reminder。重要日子(考试/回国/生日) → add_countdown。\n' +
    '· 每天定点提醒（每天9点提醒我背单词）→ set_daily_reminder；不要了 → cancel_daily_reminder。\n' +
    '· 想专注/番茄钟一段时间 → start_focus；想停 → stop_focus。\n' +
    '· 按每天/每周计划自动专注（每天10点专注1小时）→ schedule_focus；取消 → cancel_focus_plan。\n' +
    '· 提到自己在哪/搬家 → set_location。想清静 → set_supervision(false)；恢复 → set_supervision(true)。\n' +
    '· 问有哪些待办 → list_reminders。问天气/带伞 → get_weather。\n' +
    '【你还能在她电脑上动手】：看文件内容→read_file；看文件夹→list_dir；找文件→search_files；' +
    '查资料→fetch_url；改/建文件→write_file；跑命令排查或修电脑小毛病→run_command（系统会先弹确认给她点）。\n' +
    '原则：能用工具落地就别只回好的，办了再亲切告诉她；纯闲聊别硬塞工具。'
  )
}

const PERSONA =
  '你是「线条小狗」，留学伴侣的陪伴小狗，温暖俏皮。说话简洁亲切，用中文。' + hint(new Date())

function baseConfig(): AppConfig {
  return {
    provider: 'minimax-cn',
    model: 'MiniMax-M3',
    apiKey: KEY,
    systemPrompt: PERSONA,
    supervisionEnabled: true,
    reminders: [],
    reminderList: '小狗测试_可删',
    morningBriefing: { time: '08:30', enabled: true },
    eveningBriefing: { time: '22:00', enabled: true },
    anniversaries: [],
    weatherCity: '',
    memoryModel: '',
    focusPlans: []
  }
}

// 工具桩：返回貌似真实的结果，让模型能据此组织最终回复。
function cannedResult(name: string): string {
  switch (name) {
    case 'list_reminders':
      return '当前待办（2 条）：交论文、买牛奶'
    case 'get_weather':
      return '马德里今天小雨，13~19°，降水概率 80%'
    case 'list_dir':
      return '论文.docx\n照片/\n简历.pdf'
    case 'read_file':
      return '（文件内容若干行）'
    case 'search_files':
      return '找到 1 处：~/Documents/config.json:12'
    case 'run_command':
      return '/dev/disk1s1  466Gi  300Gi  166Gi  65%  /'
    default:
      return '已完成'
  }
}

interface ScenarioOut {
  tools: string[]
  args: Record<string, unknown>[]
  text: string
}

async function runHistory(
  history: { role: 'user' | 'assistant'; content: string }[],
  images?: string[]
): Promise<ScenarioOut> {
  const tools: string[] = []
  const args: Record<string, unknown>[] = []
  let text = ''
  await runChat(
    history,
    baseConfig(),
    {
      onStart: () => {},
      onDelta: () => {},
      onError: (m) => {
        throw new Error('chat error: ' + m)
      },
      onDone: (t) => {
        text = t
      },
      onToolCalls: async (calls) => {
        const results: ToolResult[] = []
        for (const c of calls) {
          tools.push(c.name)
          args.push(c.arguments ?? {})
          results.push({ toolCallId: c.id, toolName: c.name, text: cannedResult(c.name) })
        }
        return results
      }
    },
    ALL_TOOLS,
    images ?? []
  )
  return { tools, args, text }
}

async function runScenario(userText: string, images?: string[]): Promise<ScenarioOut> {
  const tools: string[] = []
  const args: Record<string, unknown>[] = []
  let text = ''
  await runChat(
    [{ role: 'user', content: userText }],
    baseConfig(),
    {
      onStart: () => {},
      onDelta: () => {},
      onError: (m) => {
        throw new Error('chat error: ' + m)
      },
      onDone: (t) => {
        text = t
      },
      onToolCalls: async (calls) => {
        const results: ToolResult[] = []
        for (const c of calls) {
          tools.push(c.name)
          args.push(c.arguments ?? {})
          results.push({ toolCallId: c.id, toolName: c.name, text: cannedResult(c.name) })
        }
        return results
      }
    },
    ALL_TOOLS,
    images ?? []
  )
  return { tools, args, text }
}

const RED_PNG =
  'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAIAAAACCAIAAAD91JpzAAAAEUlEQVR4nGP8z8Dwn4EIwDiqEAAtmwf9eN3GwwAAAABJRU5ErkJggg=='

describe.skipIf(!LIVE)('场景测试 · 真实模型沙盒', () => {
  it('问待办 → list_reminders 且回复用上结果', async () => {
    const r = await runScenario('我今天有哪些待办呀？')
    expect(r.tools).toContain('list_reminders')
    expect(r.text.length).toBeGreaterThan(0)
  }, 40000)

  it('记一次性待办 → create_reminder', async () => {
    const r = await runScenario('帮我记一下，明天下午3点要交论文')
    expect(r.tools).toContain('create_reminder')
  }, 40000)

  it('每天定点提醒 → set_daily_reminder(09:00)', async () => {
    const r = await runScenario('每天早上9点提醒我背单词')
    expect(r.tools).toContain('set_daily_reminder')
    const a = r.args[r.tools.indexOf('set_daily_reminder')]
    expect(String(a.time)).toMatch(/^0?9[:：]?0?0?/)
  }, 40000)

  it('计划式自动专注 → schedule_focus', async () => {
    const r = await runScenario('以后每天上午10点自动陪我专注一个小时')
    expect(r.tools).toContain('schedule_focus')
  }, 40000)

  it('即时专注 → start_focus(25)', async () => {
    const r = await runScenario('陪我专注25分钟吧')
    expect(r.tools).toContain('start_focus')
  }, 40000)

  it('换位置 → set_location(马德里)', async () => {
    const r = await runScenario('我搬到马德里啦')
    expect(r.tools).toContain('set_location')
  }, 40000)

  it('要清静 → set_supervision(false)', async () => {
    const r = await runScenario('帮我把提醒都静音，今天别提醒我了')
    expect(r.tools).toContain('set_supervision')
    const a = r.args[r.tools.indexOf('set_supervision')]
    expect(a.enabled).toBe(false)
  }, 40000)

  it('问天气 → get_weather 且回复提到带伞/雨', async () => {
    const r = await runScenario('马德里现在天气怎么样，要带伞吗')
    expect(r.tools).toContain('get_weather')
    expect(r.text).toMatch(/伞|雨/)
  }, 40000)

  it('看图 → 识别颜色，且不调工具', async () => {
    const r = await runScenario('这张图主要是什么颜色？', [RED_PNG])
    expect(r.text).toMatch(/红/)
    expect(r.tools.length).toBe(0)
  }, 40000)

  it('纯闲聊 → 不硬塞工具', async () => {
    const r = await runScenario('今天有点想家了，心情低落')
    expect(r.tools.length).toBe(0)
    expect(r.text.length).toBeGreaterThan(0)
  }, 40000)

  // 回归：多轮（上下文带历史助手消息）——曾因 assistant 历史 content 是字符串、
  // pi-ai 对其 .flatMap 而崩(assistantMsg.content.flatMap is not a function)。第 2 轮纠正必过。
  it('多轮纠正：带历史助手消息的第二轮不再 flatMap 崩溃', async () => {
    const r = await runHistory([
      { role: 'user', content: '我对花生过敏' },
      { role: 'assistant', content: '好～我记下了，你对花生过敏，以后聚会点外卖我都会替你留心。汪～' },
      { role: 'user', content: '不是花生，是海鲜' }
    ])
    expect(r.text.length).toBeGreaterThan(0) // 能正常回复 = 没崩
  }, 40000)

  it('多轮 + 工具：历史助手消息 + 新需求触发工具也不崩', async () => {
    const r = await runHistory([
      { role: 'user', content: '你好呀' },
      { role: 'assistant', content: '你好～我是线条小狗，今天想聊点什么？汪' },
      { role: 'user', content: '帮我记一下明天下午3点交论文' }
    ])
    expect(r.tools).toContain('create_reminder')
  }, 40000)

  // Path B 能力工具：模型应能选用文件/命令工具帮用户做电脑上的事。
  it('看文件夹 → list_dir', async () => {
    const r = await runScenario('帮我看看我 Documents 文件夹里都有些什么文件')
    expect(r.tools).toContain('list_dir')
  }, 40000)

  it('修电脑/查状态 → run_command 并把结果说人话', async () => {
    const r = await runScenario('我电脑好像快满了，帮我看看磁盘还剩多少空间')
    expect(r.tools).toContain('run_command')
    expect(r.text.length).toBeGreaterThan(0)
  }, 40000)
})
