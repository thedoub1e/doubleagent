import { join } from 'node:path'
import { app, BrowserWindow, dialog, ipcMain, Notification, powerMonitor, screen, shell } from 'electron'
import { loadDotEnv } from './env'
import { loadConfig, publicConfig, saveConfig, type Reminder } from './config'
import {
  abortChat,
  composeOpener,
  composeTitle,
  extractProfile,
  modelSupportsImages,
  runChat,
  summarizeConversation,
  type ChatMessage
} from './chat'
import { createRegistry } from './tools/registry'
import { ALL_TOOL_MODULES } from './tools/index'
import { defaultRoots } from './tools/safety'
import { auditLog } from './auditLog'
import type { ConfirmAction, ToolContext } from './tools/types'
import { clearProfile, loadProfile, saveProfile } from './profile'
import { applyProfileOps, renderProfile } from './profileUtil'
import { listReminders as osListReminders } from './remindersOs'
import { listTodayEvents as osListTodayEvents } from './calendarOs'
import { weatherLine } from './weatherNet'
import { DEFAULT_FOCUS_MINUTES, MAX_FOCUS_MINUTES, recordCompletion, streakLine, toView } from './pomodoro'
import { loadStreak, saveStreak } from './pomodoroStore'
import { eventLeadMinutes, isUpcoming } from './calendar'
import { anniversaryLine } from './anniversary'
import { isPlanDue, planDayFireKey } from './focusPlanUtil'
import { dayKey } from './scheduleUtil'
import {
  BREAK_IDLE_SEC,
  evaluatePresence,
  initialPresence,
  pickGreeting,
  shouldGreet,
  type PresenceState
} from './presence'
import {
  initialPulse,
  pickOpenerFallback,
  registerInteraction,
  registerPulse,
  shouldPulse,
  type PulseState
} from './pulse'
import { addFiredKey, loadFiredKeys } from './firedStore'
import {
  activeNeedsLlmTitle,
  activeSessionId,
  appendMessage,
  autoRetitleSession,
  clearActiveHistory,
  createSession,
  deleteSession,
  listSessionMetas,
  loadHistory,
  loadMemory,
  renameSessionTitle,
  saveMemory,
  switchSession
} from './sessions'
import { BRIEFING_EVENING_ID, BRIEFING_MORNING_ID, startScheduler } from './scheduler'
import { PET_IMAGE_EXTENSIONS, petImageDataUrl, storePetImage } from './petImage'
import { existsSync } from 'node:fs'
import { ASSET_DIR, hasAnyGif, loadGifPools, type PetGifPools } from './petAssets'
import { EMOTION_INSTRUCTION, emotionToPetState, parseEmotion, type Emotion } from '../shared/emotion'

// 启动即读项目 .env（让 MINIMAX_API_KEY 等可写进文件，不必走 UI）。
loadDotEnv()

const PET_WIDTH = 240
const PET_HEIGHT = 380 // 多出的高度留给狗头顶的主动气泡（狗底部对齐，位置不变）
const CHAT_WIDTH = 720 // 左侧会话栏(~210) + 对话主区(~500)
const CHAT_HEIGHT = 740
const MARGIN = 24
const GAP = 12
const REPLY_LINGER_MS = 2500

let petWindow: BrowserWindow | null = null
let chatWindow: BrowserWindow | null = null
let idleTimer: ReturnType<typeof setTimeout> | null = null
// 失焦自动隐藏的时间戳：用于区分「点小狗时 blur 刚隐藏」与「主动想打开」，避免一点就被重开的竞态。
let chatHiddenByBlurAt = 0
const BLUR_TOGGLE_GUARD_MS = 250

type Mood = 'idle' | 'thinking' | 'reply'

function setMood(mood: Mood): void {
  petWindow?.webContents.send('pet:mood', mood)
}

function createPetWindow(): void {
  const { workArea } = screen.getPrimaryDisplay()
  const x = workArea.x + workArea.width - PET_WIDTH - MARGIN
  const y = workArea.y + workArea.height - PET_HEIGHT - MARGIN

  petWindow = new BrowserWindow({
    width: PET_WIDTH,
    height: PET_HEIGHT,
    x,
    y,
    frame: false,
    transparent: true,
    resizable: false,
    movable: true,
    alwaysOnTop: true,
    skipTaskbar: true,
    hasShadow: false,
    fullscreenable: false,
    webPreferences: {
      preload: join(__dirname, '../preload/index.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false
    }
  })

  petWindow.setAlwaysOnTop(true, 'floating')
  petWindow.setVisibleOnAllWorkspaces(true, { visibleOnFullScreen: true })
  petWindow.setIgnoreMouseEvents(false)

  loadRenderer(petWindow, 'index')
  // 渲染层就绪后推送当前形象（精灵图 / 单图 / 默认）。
  petWindow.webContents.on('did-finish-load', () => sendPetVisual())
  petWindow.on('closed', () => {
    petWindow = null
  })
}

let gifPoolsCache: PetGifPools | null = null
function gifPools(): PetGifPools {
  if (!gifPoolsCache) {
    // 优先项目根（从源码运行时 cwd=项目根），回退 app 安装目录。
    const fromCwd = join(process.cwd(), ASSET_DIR)
    const dir = existsSync(fromCwd) ? fromCwd : join(app.getAppPath(), ASSET_DIR)
    gifPoolsCache = loadGifPools(dir)
  }
  return gifPoolsCache
}

// 形象优先级：精灵图 > 单图/GIF > 动图集(gif图/) > 默认自绘狗。统一 pet:visual 下发。
function sendPetVisual(): void {
  const cfg = loadConfig()
  if (cfg.spriteSheet?.path) {
    const dataUrl = petImageDataUrl(cfg.spriteSheet.path)
    if (dataUrl) {
      petWindow?.webContents.send('pet:visual', {
        kind: 'sprite',
        dataUrl,
        rows: cfg.spriteSheet.rows,
        cols: cfg.spriteSheet.cols,
        fps: cfg.spriteSheet.fps
      })
      return
    }
  }
  const imageUrl = petImageDataUrl(cfg.petImagePath)
  if (imageUrl) {
    petWindow?.webContents.send('pet:visual', { kind: 'image', dataUrl: imageUrl })
    return
  }
  const pools = gifPools()
  if (hasAnyGif(pools)) {
    petWindow?.webContents.send('pet:visual', { kind: 'gifset', pools })
    return
  }
  petWindow?.webContents.send('pet:visual', { kind: 'default' })
}

function createChatWindow(): void {
  chatWindow = new BrowserWindow({
    width: CHAT_WIDTH,
    height: CHAT_HEIGHT,
    minWidth: 560,
    minHeight: 480,
    show: false,
    frame: false,
    transparent: true,
    resizable: true, // 可手动拖边改大小
    alwaysOnTop: true,
    skipTaskbar: true,
    fullscreenable: false,
    webPreferences: {
      preload: join(__dirname, '../preload/index.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false
    }
  })

  chatWindow.setAlwaysOnTop(true, 'floating')
  chatWindow.setVisibleOnAllWorkspaces(true, { visibleOnFullScreen: true })
  loadRenderer(chatWindow, 'chat')
  // 点窗口外任意位置（桌面 / 小狗 / 其它 app）→ 失焦即收起，无需再点小狗。
  // 原生文件框以 sheet 形式挂在窗口上（见 pick-image/pick-sprite），不会误触发隐藏。
  chatWindow.on('blur', () => {
    if (!chatWindow || !chatWindow.isVisible()) return
    chatWindow.hide()
    chatHiddenByBlurAt = Date.now()
  })
  chatWindow.on('closed', () => {
    chatWindow = null
  })
}

function loadRenderer(win: BrowserWindow, entry: 'index' | 'chat'): void {
  const devUrl = process.env.ELECTRON_RENDERER_URL
  if (devUrl) {
    win.loadURL(entry === 'index' ? devUrl : `${devUrl}/${entry}.html`)
  } else {
    win.loadFile(join(__dirname, `../renderer/${entry === 'index' ? 'index' : 'chat'}.html`))
  }
}

function positionChatNearPet(): void {
  if (!chatWindow || !petWindow) return
  const petBounds = petWindow.getBounds()
  const { width: cw, height: ch } = chatWindow.getBounds() // 用实际尺寸，尊重用户手动改大小
  const { workArea } = screen.getDisplayMatching(petBounds)
  // 默认放在小狗左侧、顶端对齐；越界则贴回工作区内。
  let x = petBounds.x - cw - GAP
  if (x < workArea.x + MARGIN) x = petBounds.x + petBounds.width + GAP
  let y = petBounds.y + petBounds.height - ch
  if (y < workArea.y + MARGIN) y = workArea.y + MARGIN
  chatWindow.setPosition(Math.round(x), Math.round(y))
}

function toggleChat(): void {
  if (!chatWindow) createChatWindow()
  if (!chatWindow) return
  if (chatWindow.isVisible()) {
    chatWindow.hide()
    return
  }
  // 点小狗时它先抢焦点→聊天窗 blur 刚把自己隐藏；若紧接着的这次 toggle 在守护窗口内，
  // 说明这其实是「点小狗想收起」，保持隐藏，不要又弹开。
  if (Date.now() - chatHiddenByBlurAt < BLUR_TOGGLE_GUARD_MS) return
  positionChatNearPet()
  chatWindow.show()
  chatWindow.focus()
}

function scheduleIdle(): void {
  if (idleTimer) clearTimeout(idleTimer)
  idleTimer = setTimeout(() => setMood('idle'), REPLY_LINGER_MS)
}

// ---- 给模型注入今天日期 + 无感行动指令（工具执行已迁至 tools/ 引擎）----
const WEEKDAY_CN = ['日', '一', '二', '三', '四', '五', '六']

/** 注入到人设末尾：当前日期 + 「无感行动」指令，让小狗从自然对话里主动用工具帮用户。 */
function todayHint(now: Date): string {
  const y = now.getFullYear()
  const m = now.getMonth() + 1
  const d = now.getDate()
  const hh = String(now.getHours()).padStart(2, '0')
  const mi = String(now.getMinutes()).padStart(2, '0')
  return (
    `\n\n【现在】${y}-${m}-${d}（周${WEEKDAY_CN[now.getDay()]}）${hh}:${mi}。\n` +
    '【你能帮用户做事，要主动、无感地用工具，不必等她说「帮我记一下」】：\n' +
    '· 她提到要做的事/截止/约会（如「下周三交论文」「明天3点面试」）→ create_reminder（dueISO 本地时间，' +
    '相对日期据「现在」推算；只给日期不给时间就只填日期）。\n' +
    '· 她说做完了某事 → complete_reminder。\n' +
    '· 她提到重要日子（考试/回国/生日/纪念日）→ add_countdown。\n' +
    '· 她想每天定点被提醒（「每天9点提醒我背单词」）→ set_daily_reminder；不想要了 → cancel_daily_reminder。\n' +
    '· 她想专注/番茄钟/陪学一段时间（「陪我专注25分钟」「学到下午3点」按「现在」时间换算分钟）→ start_focus；' +
    '想停下 → stop_focus。\n' +
    '· 她提到自己在哪/搬家了 → set_location。\n' +
    '· 她想清静/被打扰够了 → set_supervision(false)；想恢复督促 → set_supervision(true)。\n' +
    '【你还能真的在她电脑上动手帮忙（她是电脑小白，靠你解决电脑上的事）】：\n' +
    '· 查看文件/代码/配置内容 → read_file；看文件夹里有什么 → list_dir；找某个文件在哪 → search_files。\n' +
    '· 查资料/看文档/查报错含义 → fetch_url。\n' +
    '· 需要改/新建文件 → write_file；需要跑命令排查或修电脑小毛病（装包、清缓存、看状态等）→ run_command。\n' +
    '  这两个是「动手改电脑」的操作，系统会先弹确认给她点，你正常调用即可；危险命令系统会自动拦。\n' +
    '· 干完用人话告诉她结果，别甩原始终端输出；失败也温柔，给个下一步建议。她不懂技术术语，说人话。\n' +
    '原则：能用工具落地的就别只回「好的」，要真的帮她办了再用一句话亲切告诉她；但纯闲聊别硬塞工具。\n' +
    '【记住重要事情时顺口确认一下】：当她说了你会长期记住、且会影响以后的关键事实（搬家/换城市、' +
    '过敏或健康、重要日期、改变计划或目标），自然地用一句话顺带确认你记下了（如「好～我记下你下周搬上海了」），' +
    '给她一个纠正的机会；但只对这类关键事实确认，闲聊和琐事别刻意复述、别啰嗦。'
  )
}

// 工具引擎（Path B）：生活类工具 + 电脑实干工具(文件/网络/命令)统一注册成 registry。
// 加能力 = 往对应 *_TOOL_MODULES 加一个模块，这里不动。
const petRegistry = createRegistry(ALL_TOOL_MODULES)

// ---- 危险操作确认（Path B · Phase 2 小白安全层）----
// 危险工具(写文件/跑命令)执行前向聊天窗发确认请求，用户点「允许」才放行；拒绝/超时/无窗口=保守不做。
let confirmSeq = 0
const pendingConfirms = new Map<string, (approved: boolean) => void>()
const CONFIRM_TIMEOUT_MS = 90_000

function requestConfirm(action: ConfirmAction): Promise<boolean> {
  if (!chatWindow) return Promise.resolve(false)
  showChat() // 把聊天窗弹到前面，让用户看见要确认什么
  const id = `cf-${confirmSeq++}`
  return new Promise<boolean>((resolve) => {
    let settled = false
    const finish = (ok: boolean): void => {
      if (settled) return
      settled = true
      pendingConfirms.delete(id)
      resolve(ok)
    }
    pendingConfirms.set(id, finish)
    chatWindow?.webContents.send('tool:confirm', { id, title: action.title, detail: action.detail })
    setTimeout(() => finish(false), CONFIRM_TIMEOUT_MS) // 超时保守拒绝
  })
}
ipcMain.on('tool:confirm-response', (_e, id: string, approved: boolean) => {
  pendingConfirms.get(id)?.(Boolean(approved))
})

/** 组装工具执行上下文（生活工具用 reminderList/startFocus/stopFocus；能力工具用 roots/confirm/audit）。 */
function toolContext(reminderList: string): ToolContext {
  return { reminderList, startFocus, stopFocus, roots: defaultRoots(), confirm: requestConfirm, audit: auditLog }
}

// 历史超阈值时，把较旧的部分滚动压缩进长期记忆摘要（保留最近若干条原文）。
const SUMMARIZE_THRESHOLD = 24
const KEEP_RECENT = 10
async function maybeSummarize(): Promise<void> {
  const history = loadHistory()
  const memory = loadMemory()
  if (history.length - memory.summarizedUpTo <= SUMMARIZE_THRESHOLD) return
  const upTo = Math.max(0, history.length - KEEP_RECENT)
  const slice = history.slice(memory.summarizedUpTo, upTo)
  if (slice.length === 0) return
  const summary = await summarizeConversation(slice, memory.summary, loadConfig())
  if (summary) saveMemory({ summary, summarizedUpTo: upTo })
}

// 从最近一轮对话增量抽取结构化画像（信号门控：无新信息则模型返 [] → 不写）。
async function maybeExtractProfile(): Promise<void> {
  const history = loadHistory()
  const recent = history.slice(-4) // 最近一轮上下文
  if (recent.length === 0) return
  const profile = loadProfile()
  const ops = await extractProfile(recent, profile.facts, loadConfig())
  if (ops.length === 0) return
  saveProfile(applyProfileOps(profile, ops, Date.now()))
  chatWindow?.webContents.send('profile:changed')
}

// 首轮对话后给会话起一个「总结式」标题（仅自动标题、没起过、已有用户消息时）。便宜模型、不卡回复。
async function maybeTitleSession(): Promise<void> {
  if (!activeNeedsLlmTitle()) return
  const id = activeSessionId()
  const title = await composeTitle(loadHistory().slice(-6), loadConfig())
  if (title) {
    autoRetitleSession(id, title) // 只对仍是自动标题的该会话生效，即使期间切了会话也不会改错
    chatWindow?.webContents.send('session:updated')
  }
}

/** 组装人设：基础人设 + 长期记忆摘要(叙事背景) + 结构化画像(精确档案)。chat:send 与主动开口共用。 */
function composePersona(base: ReturnType<typeof loadConfig>): string {
  const memory = loadMemory()
  const withMemory =
    memory.summary.length > 0
      ? `${base.systemPrompt}\n\n【你对用户的长期记忆】\n${memory.summary}`
      : base.systemPrompt
  const profileText = renderProfile(loadProfile())
  const withProfile =
    profileText.length > 0 ? `${withMemory}\n\n【你对用户的了解】\n${profileText}` : withMemory
  // 末尾追加情绪标注指令：让模型每次以一个 [情绪] 标签开头，驱动形象命中对应 gif 桶。
  return `${withProfile}${EMOTION_INSTRUCTION}`
}

/** 根据回复的情绪标签驱动小狗形象：兴奋→蹦跳(attention 桶)，思考→思考态，其余→回复态。 */
function driveReplyMood(emotion: Emotion | null): void {
  const state = emotion ? emotionToPetState(emotion) : 'reply'
  if (state === 'attention') {
    setMood('reply')
    petWindow?.webContents.send('pet:attention')
  } else if (state === 'thinking') {
    setMood('thinking')
  } else {
    setMood('reply')
  }
}

function showChat(): void {
  if (!chatWindow) createChatWindow()
  if (!chatWindow) return
  positionChatNearPet()
  chatWindow.show()
  chatWindow.focus()
}

// 主动监督：把一条主动消息推给用户 —— 仅「系统通知 + 头顶气泡」这一环境通道，
// 不写进会话历史、不推聊天流（问候/简报/久坐这类不该堆进对话框，避免污染真实对话；
// 多会话下也不会错落进当前活跃会话）。真正的对话只发生在用户主动开口时。
function pushProactive(message: string): void {
  // 主动消息也可能带情绪标签（如 composeOpener 走人设指令）→ 先剥干净再展示。
  const { clean } = parseEmotion(message)
  if (clean.length === 0) return
  if (Notification.isSupported()) {
    const n = new Notification({ title: '线条小狗', body: clean })
    n.on('click', () => showChat())
    n.show()
  }
  // 桌面头顶气泡：让主动消息「看得见」，不进聊天框。
  petWindow?.webContents.send('pet:say', clean)
  // 先发情绪(reply)，再发 attention —— 动图集模式下「提醒」动图后到、压过 reply，先到先被覆盖。
  setMood('reply')
  petWindow?.webContents.send('pet:attention')
  scheduleIdle()
}

/** 合成晨/晚简报文案：动态读今天的待办（reminderList）+ 今天的日历行程。 */
async function composeBriefing(kind: 'morning' | 'evening', reminderList: string): Promise<string> {
  const remRes = await osListReminders(reminderList)
  const titles = remRes.ok ? remRes.value : []
  const todoBullets = titles.map((t) => `· ${t}`).join('\n')

  if (kind === 'morning') {
    // 早安简报额外带上今天的日历行程。
    const calRes = await osListTodayEvents()
    const events = calRes.ok ? calRes.value : []
    const eventBullets = events
      .map((e) => (e.time ? `· ${e.time} ${e.title}` : `· ${e.title}`))
      .join('\n')
    // 倒数日 / 纪念日（到里程碑天数或当天才出现）。
    const now = new Date()
    const annLines = loadConfig()
      .anniversaries.map((a) => anniversaryLine(a, now))
      .filter((l): l is string => l !== null)

    // 天气（出门带伞 / 温差提醒）—— 网络失败或未设城市则安静跳过。
    const weather = await weatherLine(loadConfig().weatherCity)

    const parts = ['早安☀️']
    if (weather) parts.push(weather)
    if (annLines.length > 0) parts.push(annLines.join('\n'))
    if (events.length > 0) parts.push(`今天的安排：\n${eventBullets}`)
    if (titles.length > 0) parts.push(`别忘了的待办：\n${todoBullets}`)
    if (events.length === 0 && titles.length === 0 && annLines.length === 0) {
      parts.push('今天暂时没有安排，轻松的一天，也要好好吃饭哦～')
    }
    parts.push('一件件来，我陪你🐶')
    return parts.join('\n')
  }

  return titles.length > 0
    ? `今天辛苦啦～这些还没完成：\n${todoBullets}\n做完的记得跟我说一声，我帮你勾掉🐶`
    : '今天的待办都清空啦，超棒！早点休息，我一直在～🐶🌙'
}

// 行程前置提醒：每 5 分钟查今天日历，事件前 ~30 分钟主动提醒一次（按天去重，复用 firedStore）。
const EVENT_CHECK_INTERVAL_MS = 5 * 60_000
const EVENT_LEAD_MINUTES = 30
let eventTimer: ReturnType<typeof setInterval> | null = null

function startEventWatcher(): void {
  if (eventTimer) return
  const tick = async (): Promise<void> => {
    if (!loadConfig().supervisionEnabled) return
    const res = await osListTodayEvents()
    if (!res.ok) return
    const now = new Date()
    const fired = loadFiredKeys(now)
    for (const ev of res.value) {
      if (!ev.time || !isUpcoming(ev.time, now, EVENT_LEAD_MINUTES)) continue
      // key 的日期段须在第二个 @ 段（firedStore 按 split('@')[1] 裁剪当天），故标题里的 @ 先替换。
      const key = `event:${ev.title.replace(/@/g, '_')}@${dayKey(now)}`
      if (fired.has(key)) continue
      addFiredKey(key)
      const lead = eventLeadMinutes(ev.time, now) ?? EVENT_LEAD_MINUTES
      pushProactive(`⏰ 还有约 ${lead} 分钟就到「${ev.title}」(${ev.time}) 啦，准备一下哦🐶`)
    }
  }
  eventTimer = setInterval(() => void tick(), EVENT_CHECK_INTERVAL_MS)
  void tick()
}

// ---- 在场感知：解锁/唤醒问候 + 久坐感知（均 bounded，gated by supervisionEnabled） ----
const IDLE_POLL_INTERVAL_MS = 60_000
const SEDENTARY_MESSAGE = '已经坐了快一个小时啦，起来动一动、喝口水、看看远处吧，我等你回来🐶'
let presenceState: PresenceState = initialPresence()
let lastGreetAt: number | null = null // 解锁/唤醒/久别归来问候共用冷却，免叠加刷屏
let presenceTimer: ReturnType<typeof setInterval> | null = null

/** 解锁 / 唤醒 / 久别归来时，按冷却挑一句时段问候推给用户。 */
function maybeGreet(now: Date): void {
  if (!loadConfig().supervisionEnabled) return
  if (!shouldGreet(lastGreetAt, now.getTime())) return
  lastGreetAt = now.getTime()
  pushProactive(pickGreeting(now.getHours()))
}

function startPresenceWatcher(): void {
  if (presenceTimer) return
  // 锁屏解锁 / 睡眠唤醒：白嫖系统事件直接问候（受冷却约束）。
  powerMonitor.on('unlock-screen', () => maybeGreet(new Date()))
  powerMonitor.on('resume', () => maybeGreet(new Date()))

  // 每分钟看一次系统空闲时间，推进久坐 / 久别归来判定。
  presenceTimer = setInterval(() => {
    if (!loadConfig().supervisionEnabled) return
    const now = Date.now()
    const idleSeconds = powerMonitor.getSystemIdleTime()
    const { state, action } = evaluatePresence(presenceState, idleSeconds, now)
    presenceState = state
    if (action === 'sedentary') {
      pushProactive(SEDENTARY_MESSAGE)
    } else if (action === 'returned' && shouldGreet(lastGreetAt, now)) {
      lastGreetAt = now
      pushProactive(pickGreeting(new Date(now).getHours()))
    }
  }, IDLE_POLL_INTERVAL_MS)
}

// ---- 主动找话题（bounded pulse）：久未聊 + 人在场 → 小狗先开口（gated by supervisionEnabled） ----
const PULSE_CHECK_INTERVAL_MS = 5 * 60_000
let pulseState: PulseState = initialPulse(Date.now())
let pulseTimer: ReturnType<typeof setInterval> | null = null
let pulseInFlight = false

function startPulseWatcher(): void {
  if (pulseTimer) return
  const tick = async (): Promise<void> => {
    if (pulseInFlight) return
    if (!loadConfig().supervisionEnabled) return
    const now = new Date()
    // 人不在电脑前（长时间空闲）就别自言自语 —— 久未聊要指"在用电脑但没找我说话"。
    if (powerMonitor.getSystemIdleTime() > BREAK_IDLE_SEC) return
    if (!shouldPulse(pulseState, now)) return

    pulseInFlight = true
    try {
      const base = loadConfig()
      const recent = loadHistory().slice(-6)
      const opener =
        (await composeOpener(recent, { ...base, systemPrompt: composePersona(base) })) ??
        pickOpenerFallback(now.getHours())
      pulseState = registerPulse(pulseState, new Date())
      pushProactive(opener)
    } finally {
      pulseInFlight = false
    }
  }
  pulseTimer = setInterval(() => void tick(), PULSE_CHECK_INTERVAL_MS)
}

// ---- 计划式番茄钟：到点自动进入专注（每天/每周几，按天去重，不补发） ----
const FOCUS_PLAN_CHECK_MS = 30_000
let focusPlanTimer: ReturnType<typeof setInterval> | null = null

function startFocusPlanWatcher(): void {
  if (focusPlanTimer) return
  const tick = (): void => {
    if (!loadConfig().supervisionEnabled) return
    if (pomodoroTimeout) return // 已在专注中，不打断也不重开
    const now = new Date()
    const fired = loadFiredKeys(now)
    for (const plan of loadConfig().focusPlans) {
      if (!isPlanDue(plan, now)) continue
      const key = planDayFireKey(plan, now)
      if (fired.has(key)) continue
      addFiredKey(key)
      startFocus(plan.minutes) // 头顶倒计时气泡 + 聊天窗按钮同步
      // 仅系统通知（不写进聊天框；倒计时气泡已表明在专注）。
      const msg = `到点啦~ 按计划陪你专注 ${plan.minutes} 分钟，加油💪🐶`
      if (Notification.isSupported()) {
        const n = new Notification({ title: '线条小狗', body: msg })
        n.on('click', () => showChat())
        n.show()
      }
    }
  }
  focusPlanTimer = setInterval(tick, FOCUS_PLAN_CHECK_MS)
  tick()
}

// 调度命中：简报 id → 动态合成；普通提醒 → 直接推其文案。
async function fireScheduled(item: Reminder): Promise<void> {
  if (item.id === BRIEFING_MORNING_ID || item.id === BRIEFING_EVENING_ID) {
    const kind = item.id === BRIEFING_MORNING_ID ? 'morning' : 'evening'
    pushProactive(await composeBriefing(kind, loadConfig().reminderList))
  } else {
    pushProactive(item.message)
  }
}

// ---- 桌宠窗口交互 IPC ----
ipcMain.on('pet:set-ignore', (_e, ignore: boolean) => {
  petWindow?.setIgnoreMouseEvents(ignore, { forward: true })
})

ipcMain.on('pet:drag-by', (_e, dx: number, dy: number) => {
  if (!petWindow) return
  const [x, y] = petWindow.getPosition()
  petWindow.setPosition(Math.round(x + dx), Math.round(y + dy))
})

ipcMain.on('pet:toggle-chat', () => toggleChat())
ipcMain.on('chat:close', () => chatWindow?.hide())

// 仅放行 http(s)，用系统浏览器打开外链。
ipcMain.on('open-external', (_e, url: string) => {
  if (typeof url === 'string' && /^https?:\/\//i.test(url)) shell.openExternal(url)
})

// ---- 配置 / 历史 IPC ----
ipcMain.handle('config:get', () => publicConfig())
ipcMain.handle('config:set', (_e, patch: Record<string, unknown>) => {
  saveConfig(patch)
  return publicConfig()
})
ipcMain.handle('chat:history', () => loadHistory())
// 「清空对话记录」只清当前会话的历史+滚动摘要；画像(对你的了解)由独立按钮清，绝不在此连带清掉。
ipcMain.on('chat:clear', () => {
  clearActiveHistory()
})

// ---- 多会话管理 IPC：返回 {sessions, activeId} 让渲染层刷新列表 + 重渲染历史 ----
const sessionsView = (): { sessions: ReturnType<typeof listSessionMetas>; activeId: string } => ({
  sessions: listSessionMetas(),
  activeId: activeSessionId()
})
ipcMain.handle('session:list', () => sessionsView())
ipcMain.handle('session:create', () => {
  createSession()
  return sessionsView()
})
ipcMain.handle('session:switch', (_e, id: string) => {
  switchSession(id)
  return sessionsView()
})
ipcMain.handle('session:rename', (_e, id: string, title: string) => {
  renameSessionTitle(id, title)
  return sessionsView()
})
ipcMain.handle('session:delete', (_e, id: string) => {
  deleteSession(id)
  return sessionsView()
})

// ---- 「小狗眼中的你」画像面板 IPC ----
ipcMain.handle('profile:get', () => loadProfile().facts)
ipcMain.handle('profile:delete', (_e, id: string) => {
  saveProfile(applyProfileOps(loadProfile(), [{ op: 'DELETE', id }], Date.now()))
  return loadProfile().facts
})
ipcMain.handle('profile:update', (_e, id: string, content: string) => {
  const trimmed = (content ?? '').trim()
  if (trimmed.length > 0) {
    // 用户亲手改＝最权威信号：标高置信、非推断、constant(优先保留不淘汰)，给抽取后续不轻易覆盖的底气。
    saveProfile(
      applyProfileOps(
        loadProfile(),
        [{ op: 'UPDATE', id, content: trimmed, confidence: 1, inferred: false, constant: true }],
        Date.now()
      )
    )
  }
  return loadProfile().facts
})
ipcMain.handle('profile:clear', () => {
  clearProfile()
  return loadProfile().facts
})

// ---- 自定义形象 ----
ipcMain.handle('pet:pick-image', async () => {
  const opts = {
    title: '选一张小狗图片 / GIF',
    properties: ['openFile' as const],
    filters: [{ name: '图片', extensions: PET_IMAGE_EXTENSIONS }]
  }
  // 挂到聊天窗的 sheet：弹框期间窗口仍是 key window，不触发 blur 自动隐藏。
  const res = chatWindow
    ? await dialog.showOpenDialog(chatWindow, opts)
    : await dialog.showOpenDialog(opts)
  const picked = res.canceled ? undefined : res.filePaths[0]
  if (picked) {
    saveConfig({ petImagePath: storePetImage(picked), spriteSheet: undefined })
    sendPetVisual()
  }
  return publicConfig()
})
ipcMain.handle('pet:reset-image', () => {
  saveConfig({ petImagePath: '', spriteSheet: undefined })
  sendPetVisual()
  return publicConfig()
})

// ---- 精灵图 ----
interface SpriteDims {
  rows: number
  cols: number
  fps: number
}
ipcMain.handle('pet:pick-sprite', async (_e, dims: SpriteDims) => {
  const opts = {
    title: '选一张精灵图（行=状态，列=帧）',
    properties: ['openFile' as const],
    filters: [{ name: '图片', extensions: PET_IMAGE_EXTENSIONS }]
  }
  const res = chatWindow
    ? await dialog.showOpenDialog(chatWindow, opts)
    : await dialog.showOpenDialog(opts)
  const picked = res.canceled ? undefined : res.filePaths[0]
  if (picked) {
    const path = storePetImage(picked, 'pet-sprite')
    saveConfig({ spriteSheet: { path, rows: dims.rows, cols: dims.cols, fps: dims.fps } })
    sendPetVisual()
  }
  return publicConfig()
})
ipcMain.handle('pet:apply-sprite', (_e, dims: SpriteDims) => {
  const cfg = loadConfig()
  if (cfg.spriteSheet?.path) {
    saveConfig({ spriteSheet: { ...cfg.spriteSheet, ...dims } })
    sendPetVisual()
  }
  return publicConfig()
})
ipcMain.handle('pet:clear-sprite', () => {
  saveConfig({ spriteSheet: undefined })
  sendPetVisual()
  return publicConfig()
})
// ---- 番茄钟陪学 + 打卡 streak ----
// 计时器在主进程（关掉聊天窗也不丢）；渲染层只按 endAt 自行倒计时显示。
let pomodoroTimeout: ReturnType<typeof setTimeout> | null = null

function clearPomodoro(): void {
  if (pomodoroTimeout) clearTimeout(pomodoroTimeout)
  pomodoroTimeout = null
}

/** 启动专注：可由设置按钮或对话工具调用。返回 endAt 毫秒。 */
function startFocus(minutes: number): number {
  clearPomodoro()
  const mins =
    Number.isFinite(minutes) && minutes > 0 ? Math.min(minutes, MAX_FOCUS_MINUTES) : DEFAULT_FOCUS_MINUTES
  const endAt = Date.now() + mins * 60_000
  setMood('thinking') // 专注期间小狗陪学（看书/老师 gif）
  petWindow?.webContents.send('pet:focus', endAt) // 头顶持续倒计时
  chatWindow?.webContents.send('pomodoro:started', endAt) // 同步聊天窗按钮状态
  pomodoroTimeout = setTimeout(
    () => {
      clearPomodoro()
      const next = recordCompletion(loadStreak(), new Date())
      saveStreak(next)
      const view = toView(next, new Date())
      petWindow?.webContents.send('pet:focus', 0) // 先结束倒计时，再冒庆祝气泡
      pushProactive(`${streakLine(view)} 休息 5 分钟，活动一下再继续吧～`) // 庆祝(通知+蹦跳+情绪)
      chatWindow?.webContents.send('pomodoro:done', view)
    },
    mins * 60_000
  )
  return endAt
}

function stopFocus(): void {
  clearPomodoro()
  petWindow?.webContents.send('pet:focus', 0)
  chatWindow?.webContents.send('pomodoro:stopped')
  setMood('idle')
}

ipcMain.handle('pomodoro:state', () => toView(loadStreak(), new Date()))
ipcMain.handle('pomodoro:start', (_e, minutes: number) => startFocus(minutes))
ipcMain.handle('pomodoro:stop', () => {
  stopFocus()
  return toView(loadStreak(), new Date())
})

ipcMain.on('chat:abort', () => abortChat())

// 当前模型是否支持看图（渲染层据此显示/隐藏附图按钮）。
ipcMain.handle('chat:model-vision', () => modelSupportsImages(loadConfig()))

// ---- 一轮对话：编排 pi-ai 流式 + 驱动小狗情绪 ----
ipcMain.on('chat:send', async (_e, text: string, images?: string[]) => {
  const trimmed = (text ?? '').trim()
  const imgs = Array.isArray(images) ? images.filter((u) => typeof u === 'string' && u.startsWith('data:')) : []
  if ((trimmed.length === 0 && imgs.length === 0) || !chatWindow) return

  // 只发图不打字时，历史里存个占位文本，避免空气泡。
  const userText = trimmed.length > 0 ? trimmed : '[图片]'
  const userMsg: ChatMessage = { role: 'user', content: userText }
  const history = appendMessage(userMsg)

  const send = (channel: string, payload?: unknown): void => {
    chatWindow?.webContents.send(channel, payload)
  }

  // 用户主动发消息 → 刷新静默计时（重置主动找话题的"久未聊"判定）。
  pulseState = registerInteraction(pulseState, Date.now())

  // 注入：人设 + 长期记忆 + 画像 + 今天日期(供 create_reminder 推算相对日期)。
  const base = loadConfig()
  const systemPrompt = `${composePersona(base)}${todayHint(new Date())}`

  setMood('thinking')
  await runChat(
    history,
    { ...base, systemPrompt },
    {
      onStart: () => send('chat:start'),
      onDelta: (delta) => send('chat:delta', delta),
      onDone: (fullText) => {
        // 剥掉开头的 [情绪] 标签：历史/展示都存干净文本，形象按情绪命中对应 gif 桶。
        const { emotion, clean } = parseEmotion(fullText)
        if (clean.length > 0) appendMessage({ role: 'assistant', content: clean })
        send('chat:done', clean)
        driveReplyMood(emotion)
        scheduleIdle()
        void maybeSummarize()
        void maybeExtractProfile()
        void maybeTitleSession()
      },
      onError: (message) => {
        send('chat:error', message)
        setMood('idle')
      },
      onToolCalls: (calls) => petRegistry.dispatch(calls, toolContext(base.reminderList))
    },
    petRegistry.toolDefs(),
    imgs
  )
})

app.whenReady().then(() => {
  createPetWindow()
  createChatWindow()
  startScheduler((item) => void fireScheduled(item))
  startEventWatcher()
  startPresenceWatcher()
  startPulseWatcher()
  startFocusPlanWatcher()
  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createPetWindow()
      createChatWindow()
    }
  })
})

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit()
})
