export {}

interface PublicConfigView {
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

interface GifPoolsView {
  idle: string[]
  thinking: string[]
  reply: string[]
  attention: string[]
}

type PetVisual =
  | { kind: 'default' }
  | { kind: 'image'; dataUrl: string }
  | { kind: 'sprite'; dataUrl: string; rows: number; cols: number; fps: number }
  | { kind: 'gifset'; pools: GifPoolsView }

interface DoubleAgentApi {
  setIgnore: (ignore: boolean) => void
  dragBy: (dx: number, dy: number) => void
  toggleChat: () => void
  openExternal: (url: string) => void
  onMood: (cb: (mood: string) => void) => void
  onAttention: (cb: () => void) => void
  onSay: (cb: (text: string) => void) => void
  onFocus: (cb: (endAt: number) => void) => void
  onVisual: (cb: (visual: PetVisual) => void) => void
  pickPetImage: () => Promise<PublicConfigView>
  resetPetImage: () => Promise<PublicConfigView>
  pickSprite: (dims: SpriteDims) => Promise<PublicConfigView>
  applySprite: (dims: SpriteDims) => Promise<PublicConfigView>
  clearSprite: () => Promise<PublicConfigView>
  chat: {
    send: (text: string, images?: string[]) => void
    modelVision: () => Promise<boolean>
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
  session: {
    list: () => Promise<SessionsView>
    create: () => Promise<SessionsView>
    switch: (id: string) => Promise<SessionsView>
    rename: (id: string, title: string) => Promise<SessionsView>
    remove: (id: string) => Promise<SessionsView>
    onUpdated: (cb: () => void) => void
  }
  profile: {
    get: () => Promise<ProfileFactView[]>
    update: (id: string, content: string) => Promise<ProfileFactView[]>
    remove: (id: string) => Promise<ProfileFactView[]>
    clear: () => Promise<ProfileFactView[]>
    onChanged: (cb: () => void) => void
  }
  pomodoro: {
    start: (minutes: number) => Promise<number>
    stop: () => Promise<StreakView>
    state: () => Promise<StreakView>
    onDone: (cb: (state: StreakView) => void) => void
    onStarted: (cb: (endAt: number) => void) => void
    onStopped: (cb: () => void) => void
  }
}

declare global {
  interface ReminderView {
    id: string
    time: string
    message: string
    enabled: boolean
  }
  interface SpriteDims {
    rows: number
    cols: number
    fps: number
  }
  interface StreakView {
    currentStreak: number
    bestStreak: number
    todayCount: number
    weekCount: number
  }
  interface SessionMetaView {
    id: string
    title: string
    createdAt: number
    updatedAt: number
    lastMessageAt: number
  }
  interface SessionsView {
    sessions: SessionMetaView[]
    activeId: string
  }
  interface ProfileFactView {
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
  interface Window {
    api: DoubleAgentApi
  }
}
