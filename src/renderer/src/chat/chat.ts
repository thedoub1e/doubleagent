import './chat.css'
import { renderMarkdown } from './markdown'

const MODELS = ['MiniMax-M3', 'MiniMax-M2.7', 'MiniMax-M2.7-highspeed']

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
        <span>模型</span>
        <select id="sel-model">${MODELS.map((m) => `<option value="${m}">${m}</option>`).join('')}</select>
      </label>
      <label class="field">
        <span>MiniMax API Key</span>
        <input id="inp-key" type="password" placeholder="粘贴你的 Key" autocomplete="off" />
      </label>
      <div class="settings__row">
        <button class="ghost-btn" id="btn-clear">清空对话</button>
        <button class="primary-btn" id="btn-save">保存</button>
      </div>
      <p class="settings__hint" id="settings-hint"></p>
    </div>

    <div class="msgs" id="msgs"></div>

    <div class="banner" id="banner" hidden></div>

    <footer class="compose">
      <textarea id="inp" rows="1" placeholder="和小狗说点什么…（Enter 发送，Shift+Enter 换行）"></textarea>
      <button class="send-btn" id="btn-send" aria-label="发送">↑</button>
    </footer>
  </div>
`

const el = <T extends HTMLElement>(id: string): T => root.querySelector(`#${id}`) as T
const msgsEl = el<HTMLDivElement>('msgs')
const inputEl = el<HTMLTextAreaElement>('inp')
const sendBtn = el<HTMLButtonElement>('btn-send')
const settingsEl = el<HTMLDivElement>('settings')
const bannerEl = el<HTMLDivElement>('banner')
const modelSel = el<HTMLSelectElement>('sel-model')
const keyInput = el<HTMLInputElement>('inp-key')
const settingsHint = el<HTMLParagraphElement>('settings-hint')

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
  if (text.length === 0) return
  addMessage('user', text)
  inputEl.value = ''
  autosize()
  activeRaw = ''
  activeBubble = addMessage('assistant', '')
  activeBubble.classList.add('is-typing')
  setStreaming(true)
  showBanner('')
  window.api.chat.send(text)
}

window.api.chat.onDelta((delta) => {
  if (!activeBubble) {
    activeRaw = ''
    activeBubble = addMessage('assistant', '')
  }
  activeBubble.classList.remove('is-typing')
  activeRaw += delta
  setBubbleContent(activeBubble, 'assistant', activeRaw)
  msgsEl.scrollTop = msgsEl.scrollHeight
})

window.api.chat.onDone((fullText) => {
  if (activeBubble) {
    activeBubble.classList.remove('is-typing')
    if (fullText.length > 0) setBubbleContent(activeBubble, 'assistant', fullText)
  }
  activeBubble = null
  setStreaming(false)
  inputEl.focus()
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

async function loadConfig(): Promise<void> {
  const cfg = await window.api.config.get()
  if (MODELS.includes(cfg.model)) modelSel.value = cfg.model
  keyInput.placeholder = cfg.hasApiKey ? '已保存（留空＝不修改）' : '粘贴你的 Key'
  settingsHint.textContent = cfg.hasApiKey ? '' : '首次使用：先填 MiniMax Key 才能聊天。'
  if (!cfg.hasApiKey) {
    showBanner('还没设置 API Key —— 点右上角 ⚙ 填入 MiniMax Key。')
    settingsEl.hidden = false
  }
}

async function saveConfig(): Promise<void> {
  const patch: Record<string, unknown> = { model: modelSel.value }
  if (keyInput.value.trim().length > 0) patch.apiKey = keyInput.value.trim()
  const cfg = await window.api.config.set(patch)
  keyInput.value = ''
  keyInput.placeholder = cfg.hasApiKey ? '已保存（留空＝不修改）' : '粘贴你的 Key'
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
el<HTMLButtonElement>('btn-clear').addEventListener('click', async () => {
  window.api.chat.clear()
  msgsEl.innerHTML = ''
  settingsHint.textContent = '对话已清空'
})

void renderHistory()
void loadConfig()
inputEl.focus()
