import { join } from 'node:path'
import { app, BrowserWindow, ipcMain, Notification, screen, shell } from 'electron'
import { loadDotEnv } from './env'
import { loadConfig, publicConfig, saveConfig, type Reminder } from './config'
import { abortChat, runChat, type ChatMessage } from './chat'
import { appendMessage, clearHistory, loadHistory } from './history'
import { startScheduler } from './scheduler'

// 启动即读项目 .env（让 MINIMAX_API_KEY 等可写进文件，不必走 UI）。
loadDotEnv()

const PET_WIDTH = 240
const PET_HEIGHT = 300
const CHAT_WIDTH = 360
const CHAT_HEIGHT = 520
const MARGIN = 24
const GAP = 12
const REPLY_LINGER_MS = 2500

let petWindow: BrowserWindow | null = null
let chatWindow: BrowserWindow | null = null
let idleTimer: ReturnType<typeof setTimeout> | null = null

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
  petWindow.on('closed', () => {
    petWindow = null
  })
}

function createChatWindow(): void {
  chatWindow = new BrowserWindow({
    width: CHAT_WIDTH,
    height: CHAT_HEIGHT,
    show: false,
    frame: false,
    transparent: true,
    resizable: false,
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
  const { workArea } = screen.getDisplayMatching(petBounds)
  // 默认放在小狗左侧、顶端对齐；越界则贴回工作区内。
  let x = petBounds.x - CHAT_WIDTH - GAP
  if (x < workArea.x + MARGIN) x = petBounds.x + petBounds.width + GAP
  let y = petBounds.y + petBounds.height - CHAT_HEIGHT
  if (y < workArea.y + MARGIN) y = workArea.y + MARGIN
  chatWindow.setPosition(Math.round(x), Math.round(y))
}

function toggleChat(): void {
  if (!chatWindow) createChatWindow()
  if (!chatWindow) return
  if (chatWindow.isVisible()) {
    chatWindow.hide()
  } else {
    positionChatNearPet()
    chatWindow.show()
    chatWindow.focus()
  }
}

function scheduleIdle(): void {
  if (idleTimer) clearTimeout(idleTimer)
  idleTimer = setTimeout(() => setMood('idle'), REPLY_LINGER_MS)
}

function showChat(): void {
  if (!chatWindow) createChatWindow()
  if (!chatWindow) return
  positionChatNearPet()
  chatWindow.show()
  chatWindow.focus()
}

// 主动监督：一条提醒触发 → 系统通知 + 小狗凑过来说话(写进历史并推聊天窗) + 情绪。
function fireReminder(reminder: Reminder): void {
  if (Notification.isSupported()) {
    const n = new Notification({ title: '线条小狗 · 提醒', body: reminder.message })
    n.on('click', () => showChat())
    n.show()
  }
  appendMessage({ role: 'assistant', content: reminder.message })
  chatWindow?.webContents.send('chat:proactive', reminder.message)
  petWindow?.webContents.send('pet:attention')
  setMood('reply')
  scheduleIdle()
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
ipcMain.on('chat:clear', () => clearHistory())
ipcMain.on('chat:abort', () => abortChat())

// ---- 一轮对话：编排 pi-ai 流式 + 驱动小狗情绪 ----
ipcMain.on('chat:send', async (_e, text: string) => {
  const trimmed = (text ?? '').trim()
  if (trimmed.length === 0 || !chatWindow) return

  const userMsg: ChatMessage = { role: 'user', content: trimmed }
  const history = appendMessage(userMsg)

  const send = (channel: string, payload?: unknown): void => {
    chatWindow?.webContents.send(channel, payload)
  }

  setMood('thinking')
  await runChat(history, loadConfig(), {
    onStart: () => send('chat:start'),
    onDelta: (delta) => send('chat:delta', delta),
    onDone: (fullText) => {
      if (fullText.length > 0) appendMessage({ role: 'assistant', content: fullText })
      send('chat:done', fullText)
      setMood('reply')
      scheduleIdle()
    },
    onError: (message) => {
      send('chat:error', message)
      setMood('idle')
    }
  })
})

app.whenReady().then(() => {
  createPetWindow()
  createChatWindow()
  startScheduler(fireReminder)
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
