import './chat.css'
import { renderMarkdown } from './markdown'
import { PROVIDER_PRESETS, findPreset } from '../../../shared/providers'
import { decorateEmotionTags, parseEmotion } from '../../../shared/emotion'

const root = document.getElementById('chat-root')
if (!root) throw new Error('chat-root not found')

root.innerHTML = `
  <div class="card">
    <aside class="sidebar">
      <div class="sidebar__head">
        <span class="sidebar__title">对话</span>
        <button class="icon-btn" id="btn-new-session" title="开始新对话" aria-label="开始新对话">＋</button>
      </div>
      <div class="session-list" id="session-list"></div>
    </aside>
    <div class="main">
    <header class="bar">
      <span class="bar__title">线条小狗</span>
      <div class="bar__actions">
        <button class="icon-btn" id="btn-pomo-open" title="专注" aria-label="专注">🍅</button>
        <button class="icon-btn" id="btn-settings" title="设置" aria-label="设置">⚙︎</button>
        <button class="icon-btn" id="btn-close" title="收起" aria-label="收起">✕</button>
      </div>
    </header>

    <section class="panel" id="pomodoro-panel" hidden>
      <div class="panel__head">
        <span class="panel__title">专注</span>
        <button class="text-btn" id="btn-pomo-close">完成</button>
      </div>
      <div class="pomo">
        <p class="pomo-streak num" id="pomo-streak"></p>
        <div class="pomo-row">
          <input class="num" id="pomo-min" type="number" min="1" max="120" value="25" />
          <span class="pomo-unit">分钟</span>
          <span class="pomo-count num" id="pomo-count"></span>
        </div>
        <button class="btn-primary" id="btn-pomo">开始专注</button>
        <p class="hint">也可以直接跟小狗说「陪我专注 25 分钟」「每天上午 9 点专注一小时」。</p>
      </div>
    </section>

    <section class="panel" id="settings" hidden>
      <div class="panel__head">
        <span class="panel__title">设置</span>
        <button class="text-btn" id="btn-settings-close">完成</button>
      </div>
      <p class="note">提醒、天气、专注计划都可以直接跟小狗说，例如「每天 9 点提醒我学习」「我在马德里」「今天别管我了」。</p>
      <div class="group">
        <div class="group__head">
          <span>小狗眼中的你</span>
          <button class="text-btn" id="btn-clear-profile">清空</button>
        </div>
        <div class="profile-list" id="profile-list"></div>
      </div>
      <details class="setup" id="setup">
        <summary>模型设置（首次填一次）</summary>
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
        <label class="field-check">
          <input id="chk-autolaunch" type="checkbox" />
          <span>开机自动启动小狗（开机就有它陪着你）</span>
        </label>
        <button class="btn-primary" id="btn-save">保存模型设置</button>
      </details>
      <section class="update-box">
        <div class="update-row">
          <button class="btn-plain" id="btn-check-update">检查更新</button>
          <span class="update-status" id="update-status"></span>
        </div>
        <button class="btn-primary" id="btn-apply-update" hidden>有新版本，现在更新</button>
        <label class="field-check">
          <input id="chk-autocheck" type="checkbox" />
          <span>启动时帮我看看有没有新版本</span>
        </label>
        <p class="update-note">更新只会换掉小狗的程序，<b>你们的聊天记录和我记住你的事都不会丢</b> 🐶</p>
      </section>
      <button class="btn-plain danger" id="btn-clear">清空对话记录</button>
      <p class="hint" id="settings-hint"></p>
    </section>

    <div class="msgs" id="msgs"></div>

    <div class="banner" id="banner" hidden></div>

    <footer class="compose">
      <div class="attachments" id="attachments" hidden></div>
      <div class="compose__row">
        <button class="icon-btn attach-btn" id="btn-attach" title="发图片" aria-label="发图片" hidden>📎</button>
        <textarea id="inp" rows="1" placeholder="和小狗说点什么…"></textarea>
        <button class="send-btn" id="btn-send" aria-label="发送">↑</button>
      </div>
      <input type="file" id="file-image" accept="image/*" multiple hidden />
    </footer>
    </div>
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
const autoLaunchChk = el<HTMLInputElement>('chk-autolaunch')
const autoCheckChk = el<HTMLInputElement>('chk-autocheck')
const checkUpdateBtn = el<HTMLButtonElement>('btn-check-update')
const applyUpdateBtn = el<HTMLButtonElement>('btn-apply-update')
const updateStatusEl = el<HTMLSpanElement>('update-status')
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
    // 预填官方接口地址：没存过自定义值时直接显示该源的官方/默认 URL，用户通常只需再填 Key。
    // （反代等无官方地址的源 defaultBaseUrl 为空，仍需手填。）
    baseUrlInput.value = baseUrl && baseUrl.length > 0 ? baseUrl : preset.defaultBaseUrl ?? ''
  }
}

providerSel.addEventListener('change', () => applyProvider(providerSel.value))

let streaming = false
let activeBubble: HTMLDivElement | null = null
let activeRaw = ''
// 思考/活动披露面板（Claude Code 式「思考过程 + 正在做什么」），出现在回答气泡上方。
let streamPanel: HTMLDivElement | null = null
let thinkRaw = ''
// 打字机平滑层：activeRaw 累计已收到的全部原文（可能是大块到达），displayedLen 是当前
// 已“吐字”到屏幕的字符数。rAF 循环以稳定节奏把 displayedLen 追向目标长度，使呈现像逐字打字，
// 不受网络分块大小影响（MiniMax 经 anthropic 端点常一次回一大块）。
let displayedLen = 0
let typewriterRaf: number | null = null

// 助手气泡走 Markdown 渲染（已在 markdown.ts 内先转义防 XSS）；用户气泡纯文本。
function setBubbleContent(bubble: HTMLDivElement, role: 'user' | 'assistant', text: string): void {
  if (role === 'assistant') bubble.innerHTML = renderMarkdown(text)
  else bubble.textContent = text
}

// 流式途中的展示文本：剥掉开头情绪标签（驱动形象，不展示）+ 把正文残留标签转 emoji。
function streamDisplayText(raw: string): string {
  return decorateEmotionTags(parseEmotion(raw).clean)
}

// 开头情绪标签可能还在传输中（如收到 "[开" 尚无 "]"）→ 先别吐字，免得方括号一闪。
function leadingTagPending(raw: string): boolean {
  const t = raw.replace(/^\s+/, '')
  return t.startsWith('[') && !t.includes(']')
}

function stopTypewriter(): void {
  if (typewriterRaf !== null) {
    cancelAnimationFrame(typewriterRaf)
    typewriterRaf = null
  }
}

// 一帧吐若干字；积压越多吐越快（never 落后太远），始终只渲染目标文本的前缀（剥标签会让目标变短→夹紧）。
function pumpTypewriter(): void {
  typewriterRaf = null
  if (!activeBubble) return
  const target = streamDisplayText(activeRaw)
  if (displayedLen > target.length) displayedLen = target.length // 开头标签被剥后目标变短→夹紧
  if (displayedLen < target.length && !leadingTagPending(activeRaw)) {
    const remaining = target.length - displayedLen
    const step = Math.max(2, Math.ceil(remaining / 8)) // 平滑且自适应：积压多则加速
    displayedLen = Math.min(target.length, displayedLen + step)
    activeBubble.classList.remove('is-typing')
    setBubbleContent(activeBubble, 'assistant', target.slice(0, displayedLen))
    msgsEl.scrollTop = msgsEl.scrollHeight
  }
  // 还在流、或还有没吐完的积压 → 继续下一帧。
  if (streaming || displayedLen < target.length) {
    typewriterRaf = requestAnimationFrame(pumpTypewriter)
  }
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

// ---- 思考/活动披露面板 ----
function ensureStreamPanel(): HTMLDivElement {
  if (streamPanel) return streamPanel
  const panel = document.createElement('div')
  panel.className = 'stream-panel'
  panel.innerHTML =
    '<div class="stream-status">💭 思考中…</div><div class="think-detail" hidden></div>'
  const anchor = activeBubble?.closest('.msg')
  if (anchor) msgsEl.insertBefore(panel, anchor) // 思考在上、回答在下
  else msgsEl.appendChild(panel)
  streamPanel = panel
  msgsEl.scrollTop = msgsEl.scrollHeight
  return panel
}
function setActivity(label: string): void {
  const s = ensureStreamPanel().querySelector('.stream-status')
  if (s) s.textContent = label
}
function appendThinking(delta: string): void {
  thinkRaw += delta
  const d = ensureStreamPanel().querySelector('.think-detail') as HTMLElement
  d.hidden = false
  d.textContent = thinkRaw // textContent 防 XSS
  msgsEl.scrollTop = msgsEl.scrollHeight
}
/** 流结束：没思考内容就移除占位面板；有思考则收起成可点开的「💭 想法」。 */
function finishStreamPanel(): void {
  if (!streamPanel) return
  if (thinkRaw.trim().length === 0) {
    streamPanel.remove()
  } else {
    const status = streamPanel.querySelector('.stream-status') as HTMLElement
    const detail = streamPanel.querySelector('.think-detail') as HTMLElement
    detail.hidden = true
    status.textContent = '💭 看看小狗刚才的思考'
    status.classList.add('think-toggle')
    status.addEventListener('click', () => {
      detail.hidden = !detail.hidden
    })
  }
  streamPanel = null
  thinkRaw = ''
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
  showView('chat') // 发消息即回到对话
  addMessage('user', text.length > 0 ? text : '🖼️ [图片]')
  inputEl.value = ''
  autosize()
  pendingImages = []
  renderThumbs()
  stopTypewriter()
  activeRaw = ''
  activeBubble = null
  displayedLen = 0
  thinkRaw = ''
  streamPanel = null
  ensureStreamPanel() // 立刻显示「💭 思考中…」反馈（回答气泡由首个 delta 创建在其下方）
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

window.api.chat.onThinking((delta) => appendThinking(delta))
window.api.chat.onActivity((label) => setActivity(label))

window.api.chat.onDelta((delta) => {
  if (!activeBubble) {
    // 答案开始流式：若思考面板只是「思考中…」占位（无思考内容），就撤掉，让答案干净呈现。
    if (streamPanel && thinkRaw.trim().length === 0) {
      streamPanel.remove()
      streamPanel = null
    }
    activeRaw = ''
    displayedLen = 0
    activeBubble = addMessage('assistant', '')
  }
  // 只累计原文；具体“吐字”交给 rAF 打字机循环平滑呈现（不受网络分块大小影响）。
  activeRaw += delta
  if (typewriterRaf === null) typewriterRaf = requestAnimationFrame(pumpTypewriter)
})

window.api.chat.onDone((fullText) => {
  finishStreamPanel() // 收起/移除思考面板
  stopTypewriter() // 停止打字机，下面一次性把全文落定（不留半截）
  const clean = decorateEmotionTags(parseEmotion(fullText).clean)
  if (activeBubble) {
    activeBubble.classList.remove('is-typing')
    if (clean.length > 0) setBubbleContent(activeBubble, 'assistant', clean)
  } else if (clean.length > 0) {
    // 气泡在确认卡片处被移除过（危险操作流程）→ 此处补一个完整回答气泡，落在卡片下方。
    addMessage('assistant', clean)
  }
  activeBubble = null
  displayedLen = 0
  setStreaming(false)
  inputEl.focus()
  void refreshSessions() // 首条消息可能刚生成会话标题 / 改变排序
})

window.api.chat.onProactive((message) => {
  // 小狗主动说话（提醒 / 打卡）：作为一条助手消息出现（主进程已剥情绪标签，这里再保底一次）。
  addMessage('assistant', decorateEmotionTags(parseEmotion(message).clean))
  void refreshSessions()
})

// 危险操作确认（写文件/跑命令）：小狗执行前弹卡片，用户点「允许」才放行。
window.api.tool.onConfirm((req) => {
  showView('chat')
  // 确认卡片出现时整条移除当前流式气泡：因为最终 onDone 用的是跨轮累计全文，
  // 全文会在用户点允许后于卡片「下方」一个新气泡里完整渲染（含确认前那句开场），时间顺序自然、不重复。
  if (activeBubble) {
    activeBubble.closest('.msg')?.remove()
    activeBubble = null
    activeRaw = ''
  }
  const card = document.createElement('div')
  card.className = 'confirm-card'
  const title = document.createElement('div')
  title.className = 'confirm-title'
  title.textContent = `🐾 小狗想${req.title}，可以吗？`
  const detail = document.createElement('pre')
  detail.className = 'confirm-detail'
  detail.textContent = req.detail // textContent 防 XSS
  const actions = document.createElement('div')
  actions.className = 'confirm-actions'
  const yes = document.createElement('button')
  yes.className = 'btn-primary'
  yes.textContent = '允许'
  const no = document.createElement('button')
  no.className = 'btn-plain'
  no.textContent = '不行'
  let done = false
  const respond = (ok: boolean): void => {
    if (done) return
    done = true
    window.api.tool.confirmResponse(req.id, ok)
    actions.innerHTML = ''
    const status = document.createElement('span')
    status.className = 'confirm-status'
    status.textContent = ok ? '已允许 ✓' : '已拒绝'
    actions.appendChild(status)
  }
  yes.addEventListener('click', () => respond(true))
  no.addEventListener('click', () => respond(false))
  actions.append(yes, no)
  card.append(title, detail, actions)
  msgsEl.appendChild(card)
  msgsEl.scrollTop = msgsEl.scrollHeight
})

window.api.chat.onError((message) => {
  finishStreamPanel() // 清掉思考面板
  stopTypewriter()
  displayedLen = 0
  // 防御：万一传来非字符串，也绝不显示 [object Object]。
  const text =
    typeof message === 'string'
      ? message
      : (message as { message?: string })?.message ?? '出错了，请稍后再试'
  if (activeBubble) {
    activeBubble.classList.remove('is-typing')
    activeBubble.classList.add('is-error')
    activeBubble.textContent = text
  } else {
    showBanner(text)
  }
  activeBubble = null
  setStreaming(false)
})

// ---- 视图切换：主页=干净对话；设置 / 专注 各自覆盖式子页 ----
const pomoPanel = el<HTMLElement>('pomodoro-panel')
type View = 'chat' | 'settings' | 'pomodoro'
function showView(v: View): void {
  settingsEl.hidden = v !== 'settings'
  pomoPanel.hidden = v !== 'pomodoro'
  msgsEl.hidden = v !== 'chat'
}
function toggleSettings(): void {
  showView(settingsEl.hidden ? 'settings' : 'chat')
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
  autoLaunchChk.checked = cfg.autoLaunch
  autoCheckChk.checked = cfg.autoCheckUpdate
  settingsHint.textContent = cfg.hasApiKey ? '' : '首次使用：先填 API Key 才能聊天。'
  void refreshVision()
  void loadProfileFacts()
  if (!cfg.hasApiKey) {
    showBanner('还没设置 API Key —— 展开「模型设置」填入 Key。')
    showView('settings')
    el<HTMLDetailsElement>('setup').open = true // 首次没 key 时自动展开模型设置
  }
}

async function saveConfig(): Promise<void> {
  const patch: Record<string, unknown> = {
    provider: providerSel.value,
    model: modelSel.value,
    memoryModel: memoryModelSel.value,
    baseUrl: baseUrlInput.value.trim(),
    autoLaunch: autoLaunchChk.checked
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
  msgsEl.innerHTML = '' // 切换会话时先清空，再渲染目标会话历史
  const history = await window.api.chat.history()
  for (const m of history) {
    if (m.role === 'user') addMessage('user', m.content)
    // 历史助手消息：把可能残留的情绪标签转 emoji（兼容本次改动前存下的旧记录）。
    else if (m.role === 'assistant') addMessage('assistant', decorateEmotionTags(m.content))
  }
}

// ---- 多会话：左侧会话列表（画像/长期记忆全局共享，切换会话不影响小狗对你的了解） ----
const sessionListEl = el<HTMLDivElement>('session-list')
let activeSessionId = ''

function renderSessions(view: SessionsView): void {
  activeSessionId = view.activeId
  sessionListEl.innerHTML = ''
  for (const s of view.sessions) {
    const item = document.createElement('div')
    item.className = 'session-item' + (s.id === view.activeId ? ' is-active' : '')

    const title = document.createElement('span')
    title.className = 'session-title'
    title.textContent = s.title
    title.title = s.title
    title.addEventListener('click', () => void switchToSession(s.id))
    // 双击就地改名（用 input 而非原生 prompt，避免触发窗口失焦自动隐藏）。
    title.addEventListener('dblclick', () => startRename(item, s))

    const del = document.createElement('button')
    del.className = 'session-del'
    del.textContent = '×'
    del.title = '删除这个对话（不影响小狗对你的了解）'
    // 两步确认：点一下变「删?」，再点才删，防误删整段对话。
    confirmable(del, '删?', () => void removeSessionById(s.id))

    item.append(title, del)
    sessionListEl.appendChild(item)
  }
}

function startRename(item: HTMLElement, s: SessionMetaView): void {
  const input = document.createElement('input')
  input.className = 'session-rename'
  input.value = s.title
  let done = false
  const commit = async (keep: boolean): Promise<void> => {
    if (done) return
    done = true
    const v = input.value.trim()
    renderSessions(
      keep && v.length > 0 && v !== s.title
        ? await window.api.session.rename(s.id, v)
        : await window.api.session.list()
    )
  }
  input.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') {
      e.preventDefault()
      void commit(true)
    } else if (e.key === 'Escape') {
      void commit(false)
    }
  })
  input.addEventListener('blur', () => void commit(true))
  item.innerHTML = ''
  item.appendChild(input)
  input.focus()
  input.select()
}

// 回复流式输出途中切/建/删会话会让这条回复存错会话 → 先挡住，提示用户回复完再操作。
function blockedWhileStreaming(): boolean {
  if (!streaming) return false
  showBanner('小狗正在回复，等它说完再切换对话哦～')
  setTimeout(() => showBanner(''), 1800)
  return true
}

async function switchToSession(id: string): Promise<void> {
  if (blockedWhileStreaming()) return
  if (id === activeSessionId) {
    showView('chat')
    return
  }
  renderSessions(await window.api.session.switch(id))
  showView('chat')
  await renderHistory()
  inputEl.focus()
}

async function newSession(): Promise<void> {
  if (blockedWhileStreaming()) return
  renderSessions(await window.api.session.create())
  showView('chat')
  await renderHistory() // 新会话为空 → 消息区清空
  inputEl.focus()
}

async function removeSessionById(id: string): Promise<void> {
  if (blockedWhileStreaming()) return
  const prevActive = activeSessionId
  const view = await window.api.session.remove(id)
  renderSessions(view)
  if (view.activeId !== prevActive) {
    showView('chat')
    await renderHistory()
  }
}

async function refreshSessions(): Promise<void> {
  renderSessions(await window.api.session.list())
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
el<HTMLButtonElement>('btn-settings-close').addEventListener('click', () => showView('chat'))
el<HTMLButtonElement>('btn-pomo-open').addEventListener('click', () => {
  const open = pomoPanel.hidden
  showView(open ? 'pomodoro' : 'chat')
  if (open) void window.api.pomodoro.state().then(renderStreak) // 每次打开按"现在"刷新(跨天归零)
})
el<HTMLButtonElement>('btn-pomo-close').addEventListener('click', () => showView('chat'))
el<HTMLButtonElement>('btn-close').addEventListener('click', () => window.api.chat.close())
el<HTMLButtonElement>('btn-new-session').addEventListener('click', () => void newSession())
// 模型在首轮后异步生成总结式标题 → 刷新列表显示。
window.api.session.onUpdated(() => void refreshSessions())
el<HTMLButtonElement>('btn-save').addEventListener('click', saveConfig)

// —— 自更新（热升级）——
autoCheckChk.addEventListener('change', () => {
  void window.api.config.set({ autoCheckUpdate: autoCheckChk.checked })
})
window.api.update.onProgress((msg) => {
  updateStatusEl.textContent = msg
})
checkUpdateBtn.addEventListener('click', async () => {
  checkUpdateBtn.disabled = true
  updateStatusEl.textContent = '正在看看有没有新版本…'
  applyUpdateBtn.hidden = true
  try {
    const s = await window.api.update.check()
    if (!s.ok) {
      updateStatusEl.textContent = s.error ?? '检查更新失败了'
    } else if (s.available) {
      updateStatusEl.textContent = s.message
      applyUpdateBtn.hidden = false
    } else {
      updateStatusEl.textContent = '已经是最新版啦～🐶'
    }
  } finally {
    checkUpdateBtn.disabled = false
  }
})
applyUpdateBtn.addEventListener('click', async () => {
  applyUpdateBtn.disabled = true
  checkUpdateBtn.disabled = true
  updateStatusEl.textContent = '开始更新啦，先别关我哦…'
  try {
    const r = await window.api.update.apply()
    updateStatusEl.textContent = r.message
    if (r.relaunching) {
      // 主进程会在重启前留一点时间给这条提示渲染；这里不再做别的。
      applyUpdateBtn.hidden = true
    } else {
      // 失败/回滚：恢复按钮让她可重试。
      applyUpdateBtn.disabled = false
      checkUpdateBtn.disabled = false
      applyUpdateBtn.hidden = true
    }
  } catch {
    updateStatusEl.textContent = '更新出了点问题，等下再试试（你的记录都在）'
    applyUpdateBtn.disabled = false
    checkUpdateBtn.disabled = false
  }
})

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
    s.currentStreak > 0 ? `🔥 连续 ${s.currentStreak} 天 · 最长 ${s.bestStreak} 天` : '今天还没开始，加油吧'
  pomoCountEl.textContent = `本周 ${s.weekCount} · 今天 ${s.todayCount} 🍅`
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

void refreshSessions()
void renderHistory()
void loadConfig()
inputEl.focus()

// 聊天窗用 showInactive() 显示（避免激活 app 切桌面，见 main presentChatWindow）→ 不会自动聚焦输入框。
// 这里在窗口每次变为可见时手动聚焦，保证「点小狗即可直接打字」。
document.addEventListener('visibilitychange', () => {
  if (document.visibilityState === 'visible' && settingsEl.hidden) inputEl.focus()
})
