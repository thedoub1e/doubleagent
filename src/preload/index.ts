import { contextBridge, ipcRenderer } from 'electron'

// 最小桥接面（contextIsolation）：桌宠窗口与聊天窗口共用，各取所需。
const api = {
  // —— 桌宠 overlay ——
  setIgnore: (ignore: boolean): void => ipcRenderer.send('pet:set-ignore', ignore),
  dragBy: (dx: number, dy: number): void => ipcRenderer.send('pet:drag-by', dx, dy),
  toggleChat: (): void => ipcRenderer.send('pet:toggle-chat'),
  onMood: (cb: (mood: string) => void): void => {
    ipcRenderer.on('pet:mood', (_e, mood: string) => cb(mood))
  },

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
    }
  },

  // —— 配置 ——
  config: {
    get: (): Promise<PublicConfigView> => ipcRenderer.invoke('config:get'),
    set: (patch: Record<string, unknown>): Promise<PublicConfigView> =>
      ipcRenderer.invoke('config:set', patch)
  }
}

export interface PublicConfigView {
  provider: string
  model: string
  hasApiKey: boolean
  baseUrl?: string
  systemPrompt: string
}

contextBridge.exposeInMainWorld('api', api)

export type DoubleAgentApi = typeof api
