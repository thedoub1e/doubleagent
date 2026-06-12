export {}

interface PublicConfigView {
  provider: string
  model: string
  hasApiKey: boolean
  baseUrl?: string
  systemPrompt: string
}

interface DoubleAgentApi {
  setIgnore: (ignore: boolean) => void
  dragBy: (dx: number, dy: number) => void
  toggleChat: () => void
  openExternal: (url: string) => void
  onMood: (cb: (mood: string) => void) => void
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
  }
  config: {
    get: () => Promise<PublicConfigView>
    set: (patch: Record<string, unknown>) => Promise<PublicConfigView>
  }
}

declare global {
  interface Window {
    api: DoubleAgentApi
  }
}
