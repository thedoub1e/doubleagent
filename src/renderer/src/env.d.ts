export {}

interface PublicConfigView {
  provider: string
  model: string
  hasApiKey: boolean
  baseUrl?: string
  systemPrompt: string
  supervisionEnabled: boolean
  reminders: ReminderView[]
}

interface DoubleAgentApi {
  setIgnore: (ignore: boolean) => void
  dragBy: (dx: number, dy: number) => void
  toggleChat: () => void
  openExternal: (url: string) => void
  onMood: (cb: (mood: string) => void) => void
  onAttention: (cb: () => void) => void
  chat: {
    send: (text: string) => void
    abort: () => void
    clear: () => void
    close: () => void
    history: () => Promise<Array<{ role: string; content: string }>>
    onStart: (cb: () => void) => void
    onDelta: (cb: (delta: string) => void) => void
    onDone: (cb: (fullText: string) => void) => void
    onError: (cb: (message: string) => void) => void
    onProactive: (cb: (message: string) => void) => void
  }
  config: {
    get: () => Promise<PublicConfigView>
    set: (patch: Record<string, unknown>) => Promise<PublicConfigView>
  }
}

declare global {
  interface ReminderView {
    id: string
    time: string
    message: string
    enabled: boolean
  }
  interface Window {
    api: DoubleAgentApi
  }
}
