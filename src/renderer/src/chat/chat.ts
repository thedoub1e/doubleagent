import './chat.css'
import { renderMarkdown } from './markdown'
import { PROVIDER_PRESETS, findPreset } from '../../../shared/providers'
import { parseEmotion } from '../../../shared/emotion'

const root = document.getElementById('chat-root')
if (!root) throw new Error('chat-root not found')

root.innerHTML = `
  <div class="card">
    <header class="bar">
      <span class="bar__title">线条小狗</span>
      <div class="bar__actions">
        <button class="icon-btn" id="btn-settings" title="设置" aria-label="设置">⚙</button>
        <button class="icon-btn" id="btn-close" title="收起" aria-label="收起">×</button>
      </div>
    </header>

    <div class="settings" id="settings" hidden>
      <label class="field">
        <span>模型源</span>
        <select id="sel-provider">${PROVIDER_PRESETS.map((p) => `<option value="${p.id}">${p.label}</option>`).join('')}</select>
      </label>
      <label class="field">
        <span>模型</span>
        <select id="sel-model"></select>
      </label>
      <label class="field">
        <span>记忆模型（后台记笔记用，可选更便宜的；留空＝跟随主模型）</span>
        <select id="sel-memory-model"></select>
      </label>
      <label class="field" id="field-baseurl" hidden>
        <span>接口地址 baseURL</span>
        <input id="inp-baseurl" type="text" placeholder="https://..." autocomplete="off" />
      </label>
      <label class="field">
        <span>API Key</span>
        <input id="inp-key" type="password" placeholder="粘贴你的 Key" autocomplete="off" />
      </label>
      <p class="settings__note">提醒、天气位置、监督开关都可以直接跟小狗说，比如「每天9点提醒我学习」「我在马德里」「今天别管我了」🐶</p>
      <div class="pomodoro">
        <div class="pomo-head">
          <span>🍅 番茄钟陪学</span>
          <span class="pomo-streak" id="pomo-streak"></span>
        </div>
        <div class="pomo-row">
          <input id="pomo-min" type="number" min="1" max="120" value="25" />
          <span class="pomo-unit">分钟</span>
          <span class="pomo-count" id="pomo-count"></span>
          <button class="ghost-btn" id="btn-pomo">开始专注</button>
        </div>
      </div>
      <div class="profile-section">
        <div class="profile-head">
          <span>🐶 小狗眼中的你</span>
          <button class="ghost-btn ghost-btn--sm" id="btn-clear-profile">清空</button>
        </div>
        <div class="profile-list" id="profile-list"></div>
      </div>
      <div class="settings__row">
        <button class="ghost-btn" id="btn-clear">清空对话</button>
        <button class="primary-btn" id="btn-save">保存</button>
      </div>
      <p class="settings__hint" id="settings-hint"></p>
    </div>

    <div class="msgs" id="msgs"></div>

    <div class="banner" id="banner" hidden></div>

    <footer class="compose">
      <div class="attachments" id="attachments" hidden></div>
      <div class="compose__row">
        <button class="attach-btn" id="btn-attach" title="发图片" aria-label="发图片" hidden>📎</button>
        <textarea id="inp" rows="1" placeholder="和小狗说点什么…（Enter 发送，Shift+Enter 换行）"></textarea>
        <button class="send-btn" id="btn-send" aria-label="发送">↑</button>
      </div>
      <input type="file" id="file-image" accept="image/*" multiple hidden />
    </footer>
  </div>
`

const el = <T extends HTMLElement>(id: string): T => root.querySelector(`#${id}`) as T
const msgsEl = el<HTMLDivElement>('msgs')
const inputEl = el<HTMLTextAreaElement>('inp')
const sendBtn = el<HTMLButtonElement>('btn-send')
const settingsEl = el<HTMLDivElement>('settings')
const bannerEl = el<HTMLDivElement>('banner')
const providerSel = el<HTMLSelectElement>('sel-provider')
const modelSel = el<HTMLSelectElement>('sel-model')
const memoryModelSel = el<HTMLSelectElement>('sel-memory-model')
const baseUrlField = el<HTMLLabelElement>('field-baseurl')
const baseUrlInput = el<HTMLInputElement>('inp-baseurl')
const keyInput = el<HTMLInputElement>('inp-key')
const settingsHint = el<HTMLParagraphElement>('settings-hint')
const attachmentsEl = el<HTMLDivElement>('attachments')
const attachBtn = el<HTMLButtonElement>('btn-attach')
const fileInput = el<HTMLInputElement>('file-image')
let pendingImages: string[] = []
let visionOn = false
const MAX_IMAGES = 4

// 切源时：刷新模型下拉 + 记忆模型下拉 + 按是否自定义源显示 baseURL 输入。
function applyProvider(
  providerId: string,
  selectedModel?: string,
  baseUrl?: string,
  memoryModel?: string
): void {
  const preset = findPreset(providerId) ?? PROVIDER_PRESETS[0]
  modelSel.innerHTML = preset.models.map((m) => `<option value="${m}">${m}</option>`).join('')
  if (selectedModel && preset.models.includes(selectedModel)) modelSel.value = selectedModel
  // 记忆模型与主模型同源、同 key：首项「跟随主模型」(value='')，其余是该源的模型。
  memoryModelSel.innerHTML =
    `<option value="">跟随主模型（默认）</option>` +
    preset.models.map((m) => `<option value="${m}">${m}</option>`).join('')
  memoryModelSel.value = memoryModel && preset.models.includes(memoryModel) ? memoryModel : ''
  const isCustom = preset.kind === 'openai-compatible'
  baseUrlField.hidden = !isCustom
  if (isCustom) {
    baseUrlInput.placeholder = preset.defaultBaseUrl || 'https://...'
    baseUrlInput.value = baseUrl ?? ''
  }
}

providerSel.addEventListener('change', () => applyProvider(providerSel.value))

let streaming = false
let activeBubble: HTMLDivElement | null = null
let activeRaw = ''

// 助手气泡走 Markdown 渲染（已在 markdown.ts 内先转义防 XSS）；用户气泡纯文本。
function setBubbleContent(bubble: HTMLDivElement, role: 'user' | 'assistant', text: string): void {
  if (role === 'assistant') bubble.innerHTML = renderMarkdown(text)
  else bubble.textContent = text
}

function addMessage(role: 'user' | 'assistant', text: string): HTMLDivElement {
  const row = document.createElement('div')
  row.className = `msg msg--${role}`
  const bubble = document.createElement('div')
  bubble.className = 'bubble'
  setBubbleContent(bubble, role, text)
  row.appendChild(bubble)
  msgsEl.appendChild(row)
  msgsEl.scrollTop = msgsEl.scrollHeight
  return bubble
}

function setStreaming(on: boolean): void {
  streaming = on
  sendBtn.textContent = on ? '■' : '↑'
  sendBtn.classList.toggle('is-stop', on)
}

function showBanner(text: string): void {
  bannerEl.textContent = text
  bannerEl.hidden = text.length === 0
}

function autosize(): void {
  inputEl.style.height = 'auto'
  inputEl.style.height = `${Math.min(inputEl.scrollHeight, 120)}px`
}

// ---- 发送 / 流式 ----
function send(): void {
  if (streaming) {
    window.api.chat.abort()
    return
  }
  const text = inputEl.value.trim()
  const images = pendingImages.slice()
  if (text.length === 0 && images.length === 0) return
  addMessage('user', text.length > 0 ? text : '🖼️ [图片]')
  inputEl.value = ''
  autosize()
  pendingImages = []
  renderThumbs()
  activeRaw = ''
  activeBubble = addMessage('assistant', '')
  activeBubble.classList.add('is-typing')
  setStreaming(true)
  showBanner('')
  window.api.chat.send(text, images.length > 0 ? images : undefined)
}

// ---- 图片附件 ----
function renderThumbs(): void {
  attachmentsEl.hidden = pendingImages.length === 0
  attachmentsEl.innerHTML = ''
  pendingImages.forEach((url, i) => {
    const wrap = document.createElement('div')
    wrap.className = 'attach-thumb'
    const img = document.createElement('img')
    img.src = url // dataURL，渲染层本地数据
    const del = document.createElement('button')
    del.className = 'attach-del'
    del.textContent = '×'
    del.title = '移除'
    del.addEventListener('click', () => {
      pendingImages.splice(i, 1)
      renderThumbs()
    })
    wrap.append(img, del)
    attachmentsEl.appendChild(wrap)
  })
}

function addFiles(files: ArrayLike<File>): void {
  if (!visionOn) return
  for (const f of Array.from(files)) {
    if (!f.type.startsWith('image/')) continue
    if (pendingImages.length >= MAX_IMAGES) break
    const reader = new FileReader()
    reader.onload = () => {
      if (typeof reader.result === 'string' && pendingImages.length < MAX_IMAGES) {
        pendingImages.push(reader.result)
        renderThumbs()
      }
    }
    reader.readAsDataURL(f)
  }
}

// 当前模型是否支持看图 → 显示/隐藏附图按钮（不支持则清掉已选图）。
async function refreshVision(): Promise<void> {
  visionOn = await window.api.chat.modelVision()
  attachBtn.hidden = !visionOn
  if (!visionOn && pendingImages.length > 0) {
    pendingImages = []
    renderThumbs()
  }
}

attachBtn.addEventListener('click', () => fileInput.click())
fileInput.addEventListener('change', () => {
  if (fileInput.files) addFiles(fileInput.files)
  fileInput.value = '' // 允许重复选同一文件
})
inputEl.addEventListener('paste', (e) => {
  const items = e.clipboardData?.items
  if (!items) return
  const imgs = Array.from(items)
    .filter((it) => it.kind === 'file' && it.type.startsWith('image/'))
    .map((it) => it.getAsFile())
    .filter((f): f is File => f !== null)
  if (imgs.length > 0) {
    e.preventDefault()
    addFiles(imgs)
  }
})
const composeEl = root.querySelector('.compose') as HTMLElement
composeEl.addEventListener('dragover', (e) => e.preventDefault())
composeEl.addEventListener('drop', (e) => {
  e.preventDefault()
  if (e.dataTransfer?.files?.length) addFiles(e.dataTransfer.files)
})

window.api.chat.onDelta((delta) => {
  if (!activeBubble) {
    activeRaw = ''
    activeBubble = addMessage('assistant', '')
  }
  activeBubble.classList.remove('is-typing')
  activeRaw += delta
  // 剥掉开头的 [情绪] 标签后再渲染（流式途中即时剥，避免标签一闪而过）。
  setBubbleContent(activeBubble, 'assistant', parseEmotion(activeRaw).clean)
  msgsEl.scrollTop = msgsEl.scrollHeight
})

window.api.chat.onDone((fullText) => {
  const clean = parseEmotion(fullText).clean
  if (activeBubble) {
    activeBubble.classList.remove('is-typing')
    if (clean.length > 0) setBubbleContent(activeBubble, 'assistant', clean)
  }
  activeBubble = null
  setStreaming(false)
  inputEl.focus()
})

window.api.chat.onProactive((message) => {
  // 小狗主动说话（提醒 / 打卡）：作为一条助手消息出现（主进程已剥情绪标签，这里再保底一次）。
  addMessage('assistant', parseEmotion(message).clean)
})

window.api.chat.onError((message) => {
  if (activeBubble) {
    activeBubble.classList.remove('is-typing')
    activeBubble.classList.add('is-error')
    activeBubble.textContent = message
  } else {
    showBanner(message)
  }
  activeBubble = null
  setStreaming(false)
})

// ---- 设置 ----
function toggleSettings(): void {
  settingsEl.hidden = !settingsEl.hidden
}

// ---- 「小狗眼中的你」画像 ----
const profileListEl = el<HTMLDivElement>('profile-list')
const CAT_LABEL: Record<string, string> = {
  identity: '身份',
  preference: '喜好',
  concern: '在意',
  commitment: '约定',
  trait: '性格'
}

function renderProfileFacts(facts: ProfileFactView[]): void {
  profileListEl.innerHTML = ''
  if (facts.length === 0) {
    const empty = document.createElement('p')
    empty.className = 'profile-empty'
    empty.textContent = '还在慢慢认识你呢…多聊聊吧🐶'
    profileListEl.appendChild(empty)
    return
  }
  for (const f of facts) {
    const row = document.createElement('div')
    row.className = 'profile-fact'
    const tag = document.createElement('span')
    tag.className = 'profile-tag'
    tag.textContent = f.inferred || f.confidence < 0.5 ? '推测' : (CAT_LABEL[f.category] ?? '')
    const input = document.createElement('input')
    input.className = 'profile-content'
    input.type = 'text'
    input.value = f.content // 经 .value 赋值，非 innerHTML → 无 XSS
    input.addEventListener('change', () => void window.api.profile.update(f.id, input.value))
    const del = document.createElement('button')
    del.className = 'profile-del'
    del.textContent = '×'
    del.title = '让小狗忘记这条'
    del.addEventListener('click', async () => renderProfileFacts(await window.api.profile.remove(f.id)))
    row.append(tag, input, del)
    profileListEl.appendChild(row)
  }
}

async function loadProfileFacts(): Promise<void> {
  renderProfileFacts(await window.api.profile.get())
}

async function loadConfig(): Promise<void> {
  const cfg = await window.api.config.get()
  if (findPreset(cfg.provider)) providerSel.value = cfg.provider
  applyProvider(providerSel.value, cfg.model, cfg.baseUrl, cfg.memoryModel)
  keyInput.placeholder = cfg.hasApiKey ? '已保存（留空＝不修改）' : '粘贴你的 Key'
  settingsHint.textContent = cfg.hasApiKey ? '' : '首次使用：先填 API Key 才能聊天。'
  void refreshVision()
  void loadProfileFacts()
  if (!cfg.hasApiKey) {
    showBanner('还没设置 API Key —— 点右上角 ⚙ 填入 Key。')
    settingsEl.hidden = false
  }
}

async function saveConfig(): Promise<void> {
  const patch: Record<string, unknown> = {
    provider: providerSel.value,
    model: modelSel.value,
    memoryModel: memoryModelSel.value,
    baseUrl: baseUrlInput.value.trim()
  }
  if (keyInput.value.trim().length > 0) patch.apiKey = keyInput.value.trim()
  const cfg = await window.api.config.set(patch)
  keyInput.value = ''
  keyInput.placeholder = cfg.hasApiKey ? '已保存（留空＝不修改）' : '粘贴你的 Key'
  void refreshVision() // 换模型后刷新附图按钮可见性
  settingsHint.textContent = '已保存 ✓'
  if (cfg.hasApiKey) showBanner('')
}

async function renderHistory(): Promise<void> {
  const history = await window.api.chat.history()
  for (const m of history) {
    if (m.role === 'user' || m.role === 'assistant') addMessage(m.role, m.content)
  }
}

// ---- 事件绑定 ----
// Markdown 链接：在系统浏览器打开，绝不让聊天窗自身导航走。
msgsEl.addEventListener('click', (e) => {
  const link = (e.target as HTMLElement).closest('.md-link') as HTMLElement | null
  if (link?.dataset.href) {
    e.preventDefault()
    window.api.openExternal(link.dataset.href)
  }
})

sendBtn.addEventListener('click', send)
inputEl.addEventListener('input', autosize)
inputEl.addEventListener('keydown', (e) => {
  if (e.key === 'Enter' && !e.shiftKey) {
    e.preventDefault()
    send()
  }
})
el<HTMLButtonElement>('btn-settings').addEventListener('click', toggleSettings)
el<HTMLButtonElement>('btn-close').addEventListener('click', () => window.api.chat.close())
el<HTMLButtonElement>('btn-save').addEventListener('click', saveConfig)

// 两步确认：破坏性操作(清空对话/清空画像)点一下变「确认?」，3 秒内再点才执行，防误触。
// 用内联确认而非原生 confirm()，避免触发窗口失焦→自动隐藏。
const CONFIRM_WINDOW_MS = 3000
function confirmable(btn: HTMLButtonElement, confirmLabel: string, action: () => void): void {
  const original = btn.textContent ?? ''
  let armed = false
  let timer: ReturnType<typeof setTimeout> | null = null
  const reset = (): void => {
    armed = false
    btn.textContent = original
    btn.classList.remove('is-armed')
    if (timer) {
      clearTimeout(timer)
      timer = null
    }
  }
  btn.addEventListener('click', () => {
    if (armed) {
      reset()
      action()
      return
    }
    armed = true
    btn.textContent = confirmLabel
    btn.classList.add('is-armed')
    timer = setTimeout(reset, CONFIRM_WINDOW_MS)
  })
}

confirmable(el<HTMLButtonElement>('btn-clear'), '确认清空对话？', () => {
  window.api.chat.clear()
  msgsEl.innerHTML = ''
  settingsHint.textContent = '对话已清空'
})
confirmable(el<HTMLButtonElement>('btn-clear-profile'), '确认清空？', async () => {
  renderProfileFacts(await window.api.profile.clear())
  settingsHint.textContent = '小狗对你的记忆已清空'
})
// 后台抽取出新画像时实时刷新面板。
window.api.profile.onChanged(() => void loadProfileFacts())

// ---- 🍅 番茄钟陪学 + 打卡 streak ----
const pomoBtn = el<HTMLButtonElement>('btn-pomo')
const pomoMin = el<HTMLInputElement>('pomo-min')
const pomoStreakEl = el<HTMLSpanElement>('pomo-streak')
const pomoCountEl = el<HTMLSpanElement>('pomo-count')
let pomoEndAt = 0
let pomoTick: ReturnType<typeof setInterval> | null = null

function fmtMMSS(ms: number): string {
  const s = Math.max(0, Math.ceil(ms / 1000))
  return `${String(Math.floor(s / 60)).padStart(2, '0')}:${String(s % 60).padStart(2, '0')}`
}

function renderStreak(s: StreakView): void {
  pomoStreakEl.textContent =
    s.currentStreak > 0 ? `🔥 连续 ${s.currentStreak} 天 · 最长 ${s.bestStreak} 天` : '还没开始打卡哦'
  pomoCountEl.textContent = s.todayCount > 0 ? `今天 ${s.todayCount} 🍅` : ''
}

function stopPomoUi(): void {
  if (pomoTick) clearInterval(pomoTick)
  pomoTick = null
  pomoEndAt = 0
  pomoBtn.textContent = '开始专注'
  pomoMin.disabled = false
}

function startPomoUi(endAt: number): void {
  pomoEndAt = endAt
  pomoMin.disabled = true
  const refresh = (): void => {
    const left = pomoEndAt - Date.now()
    pomoBtn.textContent = left > 0 ? `专注中 ${fmtMMSS(left)}（停止）` : '专注中…'
  }
  refresh()
  pomoTick = setInterval(refresh, 1000)
}

pomoBtn.addEventListener('click', async () => {
  if (pomoEndAt > 0) {
    renderStreak(await window.api.pomodoro.stop())
    stopPomoUi()
    return
  }
  const minutes = Math.min(Math.max(Number(pomoMin.value) || 25, 1), 120)
  void window.api.pomodoro.start(minutes) // UI 由 onStarted 事件驱动（对话工具启动时也能同步）
})

// 专注开始（按钮或对话工具触发）→ 同步按钮倒计时。
window.api.pomodoro.onStarted((endAt) => startPomoUi(endAt))
// 中途被对话工具停止 → 复位按钮。
window.api.pomodoro.onStopped(() => stopPomoUi())
// 计时到点 → 庆祝消息走 onProactive，这里收 streak 刷新并复位按钮。
window.api.pomodoro.onDone((s) => {
  stopPomoUi()
  renderStreak(s)
})

void window.api.pomodoro.state().then(renderStreak)

void renderHistory()
void loadConfig()
inputEl.focus()
