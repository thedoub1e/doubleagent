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
    send: (text: string): void => ipcRenderer.send('chat:send', text),
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
  }
}

export interface ReminderView {
  id: string
  time: string
  message: string
  enabled: boolean
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
}

contextBridge.exposeInMainWorld('api', api)

export type DoubleAgentApi = typeof api
