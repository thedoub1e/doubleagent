import { contextBridge, ipcRenderer } from 'electron'

// 最小桥接面（contextIsolation）：桌宠窗口与聊天窗口共用，各取所需。
const api = {
  // —— 桌宠 overlay ——
  setIgnore: (ignore: boolean): void => ipcRenderer.send('pet:set-ignore', ignore),
  dragBy: (dx: number, dy: number): void => ipcRenderer.send('pet:drag-by', dx, dy),
  toggleChat: (): void => ipcRenderer.send('pet:toggle-chat'),
  openExternal: (url: string): void => ipcRenderer.send('open-external', url),
  onMood: (cb: (mood: string) => void): void => {
    ipcRenderer.on('pet:mood', (_e, mood: string) => cb(mood))
  },
  onAttention: (cb: () => void): void => {
    ipcRenderer.on('pet:attention', () => cb())
  },
  onSay: (cb: (text: string) => void): void => {
    ipcRenderer.on('pet:say', (_e, text: string) => cb(text))
  },
  onFocus: (cb: (endAt: number) => void): void => {
    ipcRenderer.on('pet:focus', (_e, endAt: number) => cb(endAt))
  },
  onVisual: (cb: (visual: PetVisual) => void): void => {
    ipcRenderer.on('pet:visual', (_e, visual: PetVisual) => cb(visual))
  },
  pickPetImage: (): Promise<PublicConfigView> => ipcRenderer.invoke('pet:pick-image'),
  resetPetImage: (): Promise<PublicConfigView> => ipcRenderer.invoke('pet:reset-image'),
  pickSprite: (dims: SpriteDims): Promise<PublicConfigView> => ipcRenderer.invoke('pet:pick-sprite', dims),
  applySprite: (dims: SpriteDims): Promise<PublicConfigView> => ipcRenderer.invoke('pet:apply-sprite', dims),
  clearSprite: (): Promise<PublicConfigView> => ipcRenderer.invoke('pet:clear-sprite'),

  // —— 聊天 ——
  chat: {
    send: (text: string, images?: string[]): void => ipcRenderer.send('chat:send', text, images),
    modelVision: (): Promise<boolean> => ipcRenderer.invoke('chat:model-vision'),
    abort: (): void => ipcRenderer.send('chat:abort'),
    clear: (): void => ipcRenderer.send('chat:clear'),
    close: (): void => ipcRenderer.send('chat:close'),
    history: (): Promise<Array<{ role: string; content: string }>> => ipcRenderer.invoke('chat:history'),
    onStart: (cb: () => void): void => {
      ipcRenderer.on('chat:start', () => cb())
    },
    onDelta: (cb: (delta: string) => void): void => {
      ipcRenderer.on('chat:delta', (_e, delta: string) => cb(delta))
    },
    onDone: (cb: (fullText: string) => void): void => {
      ipcRenderer.on('chat:done', (_e, fullText: string) => cb(fullText))
    },
    onError: (cb: (message: string) => void): void => {
      ipcRenderer.on('chat:error', (_e, message: string) => cb(message))
    },
    onProactive: (cb: (message: string) => void): void => {
      ipcRenderer.on('chat:proactive', (_e, message: string) => cb(message))
    }
  },

  // —— 配置 ——
  config: {
    get: (): Promise<PublicConfigView> => ipcRenderer.invoke('config:get'),
    set: (patch: Record<string, unknown>): Promise<PublicConfigView> =>
      ipcRenderer.invoke('config:set', patch)
  },

  // —— 番茄钟陪学 + 打卡 streak ——
  pomodoro: {
    start: (minutes: number): Promise<number> => ipcRenderer.invoke('pomodoro:start', minutes),
    stop: (): Promise<StreakView> => ipcRenderer.invoke('pomodoro:stop'),
    state: (): Promise<StreakView> => ipcRenderer.invoke('pomodoro:state'),
    onDone: (cb: (state: StreakView) => void): void => {
      ipcRenderer.on('pomodoro:done', (_e, state: StreakView) => cb(state))
    },
    onStarted: (cb: (endAt: number) => void): void => {
      ipcRenderer.on('pomodoro:started', (_e, endAt: number) => cb(endAt))
    },
    onStopped: (cb: () => void): void => {
      ipcRenderer.on('pomodoro:stopped', () => cb())
    }
  },

  // —— 多会话管理 ——
  session: {
    list: (): Promise<SessionsView> => ipcRenderer.invoke('session:list'),
    create: (): Promise<SessionsView> => ipcRenderer.invoke('session:create'),
    switch: (id: string): Promise<SessionsView> => ipcRenderer.invoke('session:switch', id),
    rename: (id: string, title: string): Promise<SessionsView> =>
      ipcRenderer.invoke('session:rename', id, title),
    remove: (id: string): Promise<SessionsView> => ipcRenderer.invoke('session:delete', id),
    onUpdated: (cb: () => void): void => {
      ipcRenderer.on('session:updated', () => cb())
    }
  },

  // —— 「小狗眼中的你」画像 ——
  profile: {
    get: (): Promise<ProfileFactView[]> => ipcRenderer.invoke('profile:get'),
    update: (id: string, content: string): Promise<ProfileFactView[]> =>
      ipcRenderer.invoke('profile:update', id, content),
    remove: (id: string): Promise<ProfileFactView[]> => ipcRenderer.invoke('profile:delete', id),
    clear: (): Promise<ProfileFactView[]> => ipcRenderer.invoke('profile:clear'),
    onChanged: (cb: () => void): void => {
      ipcRenderer.on('profile:changed', () => cb())
    }
  }
}

export interface SessionMetaView {
  id: string
  title: string
  createdAt: number
  updatedAt: number
  lastMessageAt: number
}

export interface SessionsView {
  sessions: SessionMetaView[]
  activeId: string
}

export interface ProfileFactView {
  id: string
  category: 'identity' | 'preference' | 'concern' | 'commitment' | 'trait'
  content: string
  inferred: boolean
  factType: 'world' | 'experience' | 'opinion'
  confidence: number
  supersedes?: string
  constant?: boolean
  createdAt: number
  updatedAt: number
}

export interface ReminderView {
  id: string
  time: string
  message: string
  enabled: boolean
}

export interface StreakView {
  currentStreak: number
  bestStreak: number
  todayCount: number
  weekCount: number
}

export interface SpriteDims {
  rows: number
  cols: number
  fps: number
}

export interface GifPoolsView {
  idle: string[]
  thinking: string[]
  reply: string[]
  attention: string[]
}

export type PetVisual =
  | { kind: 'default' }
  | { kind: 'image'; dataUrl: string }
  | { kind: 'sprite'; dataUrl: string; rows: number; cols: number; fps: number }
  | { kind: 'gifset'; pools: GifPoolsView }

export interface PublicConfigView {
  provider: string
  model: string
  hasApiKey: boolean
  baseUrl?: string
  systemPrompt: string
  supervisionEnabled: boolean
  reminders: ReminderView[]
  hasPetImage: boolean
  hasSprite: boolean
  spriteSheet?: SpriteDims
  weatherCity: string
  memoryModel: string
}

contextBridge.exposeInMainWorld('api', api)

export type DoubleAgentApi = typeof api
