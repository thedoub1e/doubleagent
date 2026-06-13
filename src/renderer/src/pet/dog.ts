// 占位线条小狗（自绘扁平风，原创 fallback）。后续会替换为现成线条小狗素材 / 用户上传图片。
// 三态情绪：idle 待机 / thinking 思考 / reply 回复。仅靠换「脸」表达，身体不变。

import { createSprite, type SpriteConfig, type SpriteHandle } from './sprite'

export type Mood = 'idle' | 'thinking' | 'reply'

const CAPTION: Record<Mood, string> = {
  idle: '待机中',
  thinking: '思考中…',
  reply: '汪！'
}

// 情绪 → 精灵图行号（每状态一行）。
const ROW_MAP: Record<Mood, number> = { idle: 0, thinking: 1, reply: 2 }

// 线条小狗风（极简线条马尔济斯）：大圆头 + 两只长垂耳框脸 + 豆豆眼。坐标基于头心 (90, 84)。
// 每个脸是一段 SVG，注入到 <g class="pet__face">。
const FACE: Record<Mood, string> = {
  idle: `
    <circle cx="78" cy="82" r="4.2" fill="#1a1a1a" />
    <circle cx="102" cy="82" r="4.2" fill="#1a1a1a" />
    <circle cx="90" cy="93" r="3" fill="#1a1a1a" />
    <path d="M83 99 q7 6 14 0" fill="none" stroke="#1a1a1a" stroke-width="2.6" stroke-linecap="round" />
  `,
  thinking: `
    <path d="M73 82 q5 -6 10 0" fill="none" stroke="#1a1a1a" stroke-width="2.8" stroke-linecap="round" />
    <path d="M97 82 q5 -6 10 0" fill="none" stroke="#1a1a1a" stroke-width="2.8" stroke-linecap="round" />
    <circle cx="90" cy="93" r="3" fill="#1a1a1a" />
    <circle cx="90" cy="101" r="2" fill="#1a1a1a" />
  `,
  reply: `
    <path d="M73 84 q5 5 10 0" fill="none" stroke="#1a1a1a" stroke-width="2.8" stroke-linecap="round" />
    <path d="M97 84 q5 5 10 0" fill="none" stroke="#1a1a1a" stroke-width="2.8" stroke-linecap="round" />
    <circle cx="90" cy="93" r="3" fill="#1a1a1a" />
    <path d="M82 99 q8 9 16 0" fill="none" stroke="#1a1a1a" stroke-width="2.6" stroke-linecap="round" />
  `
}

const STROKE = '#2b2b2b'

const dogSvg = (face: string): string => `
<svg class="pet__svg" viewBox="0 0 180 200" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
  <path d="M124 150 q20 1 16 -18" fill="none" stroke="${STROKE}" stroke-width="3.2" stroke-linecap="round" />
  <ellipse cx="90" cy="150" rx="33" ry="25" fill="#fff" stroke="${STROKE}" stroke-width="3.2" />
  <ellipse cx="78" cy="171" rx="8.5" ry="6" fill="#fff" stroke="${STROKE}" stroke-width="3.2" />
  <ellipse cx="102" cy="171" rx="8.5" ry="6" fill="#fff" stroke="${STROKE}" stroke-width="3.2" />
  <path d="M64 60 q-26 6 -22 46 q2 16 18 14 q3 -30 8 -56 z" fill="#fff" stroke="${STROKE}" stroke-width="3.2" stroke-linejoin="round" />
  <path d="M116 60 q26 6 22 46 q-2 16 -18 14 q-3 -30 -8 -56 z" fill="#fff" stroke="${STROKE}" stroke-width="3.2" stroke-linejoin="round" />
  <ellipse cx="90" cy="84" rx="42" ry="40" fill="#fff" stroke="${STROKE}" stroke-width="3.4" />
  <g class="pet__face">${face}</g>
</svg>`

export interface GifPools {
  idle: string[]
  thinking: string[]
  reply: string[]
  attention: string[]
}

const IDLE_CYCLE_MS = 7000

export interface Dog {
  el: HTMLDivElement
  chatButton: HTMLButtonElement
  setMood: (mood: Mood) => void
  setImage: (dataUrl: string | null) => void
  setSprite: (config: SpriteConfig | null) => void
  setGifSet: (pools: GifPools | null) => void
  flashAttention: () => void
  /** 主动消息时在小狗头顶冒出气泡，数秒后自动淡出。 */
  say: (text: string) => void
  /** 立即收起气泡（如点开聊天时）。 */
  hideBubble: () => void
}

const BUBBLE_LINGER_MS = 8000

export function createDog(): Dog {
  const el = document.createElement('div')
  el.className = 'pet'
  el.innerHTML = `
    <button class="pet__chat" type="button" title="打开聊天" aria-label="打开聊天">💬</button>
    <div class="pet__bubble" hidden></div>
    <div class="pet__stage">${dogSvg(FACE.idle)}</div>
    <div class="pet__caption">${CAPTION.idle}</div>
  `

  const chatButton = el.querySelector('.pet__chat') as HTMLButtonElement
  const bubble = el.querySelector('.pet__bubble') as HTMLDivElement
  const stage = el.querySelector('.pet__stage') as HTMLDivElement
  const caption = el.querySelector('.pet__caption') as HTMLDivElement

  let currentMood: Mood = 'idle'
  let mode: 'svg' | 'image' | 'sprite' | 'gifset' = 'svg'
  let sprite: SpriteHandle | null = null
  let gifPools: GifPools | null = null
  let idleCycle: ReturnType<typeof setInterval> | null = null

  const stopSprite = (): void => {
    sprite?.stop()
    sprite = null
  }
  const stopIdleCycle = (): void => {
    if (idleCycle) clearInterval(idleCycle)
    idleCycle = null
  }
  const cleanupAnim = (): void => {
    stopSprite()
    stopIdleCycle()
  }

  const pick = (arr: string[]): string | undefined =>
    arr.length > 0 ? arr[Math.floor(Math.random() * arr.length)] : undefined

  const showGif = (url: string): void => {
    const img = document.createElement('img')
    img.className = 'pet__img'
    img.src = url
    img.alt = '桌宠'
    stage.replaceChildren(img)
  }

  const poolFor = (mood: Mood): string[] => {
    if (!gifPools) return []
    return gifPools[mood].length > 0 ? gifPools[mood] : gifPools.idle
  }

  const startIdleCycle = (): void => {
    stopIdleCycle()
    if (gifPools && gifPools.idle.length > 1) {
      idleCycle = setInterval(() => {
        const url = pick(gifPools!.idle)
        if (url) showGif(url)
      }, IDLE_CYCLE_MS)
    }
  }

  const setMood = (mood: Mood): void => {
    currentMood = mood
    caption.textContent = CAPTION[mood]
    stage.dataset.mood = mood
    if (mode === 'sprite') {
      sprite?.setRow(ROW_MAP[mood])
    } else if (mode === 'gifset') {
      stopIdleCycle()
      const url = pick(poolFor(mood))
      if (url) showGif(url)
      if (mood === 'idle') startIdleCycle()
    } else if (mode === 'svg') {
      // 重建整段 SVG：经 HTML 解析器路径，<circle>/<path> 才落到正确的 SVG 命名空间。
      stage.innerHTML = dogSvg(FACE[mood])
    }
  }

  // 单图形象：有 dataUrl 用 <img>(GIF 自带动画)；null 回到自绘三态狗。
  const setImage = (dataUrl: string | null): void => {
    cleanupAnim()
    if (dataUrl) {
      mode = 'image'
      showGif(dataUrl)
    } else {
      mode = 'svg'
      setMood(currentMood)
    }
  }

  // 精灵图：行=状态、列=帧，rAF 分帧播放。null 不在此恢复（由调用方接 setImage）。
  const setSprite = (config: SpriteConfig | null): void => {
    cleanupAnim()
    if (!config) return
    mode = 'sprite'
    sprite = createSprite(config)
    stage.replaceChildren(sprite.el)
    sprite.setRow(ROW_MAP[currentMood])
  }

  // 动图集：按情绪从对应池子随机播放；待机在池子内轮换。null → 回自绘狗。
  const setGifSet = (pools: GifPools | null): void => {
    cleanupAnim()
    const total = pools
      ? pools.idle.length + pools.thinking.length + pools.reply.length + pools.attention.length
      : 0
    if (pools && total > 0) {
      mode = 'gifset'
      gifPools = pools
      setMood(currentMood)
    } else {
      gifPools = null
      mode = 'svg'
      setMood(currentMood)
    }
  }

  // 提醒触发时播放「提醒」池动图（动图集模式）；其它模式无操作（靠蹦跳动画）。
  const flashAttention = (): void => {
    if (mode !== 'gifset' || !gifPools) return
    stopIdleCycle()
    const fallback = gifPools.attention.length > 0 ? gifPools.attention : gifPools.reply
    const url = pick(fallback.length > 0 ? fallback : gifPools.idle)
    if (url) showGif(url)
  }

  let bubbleTimer: ReturnType<typeof setTimeout> | null = null
  const hideBubble = (): void => {
    if (bubbleTimer) {
      clearTimeout(bubbleTimer)
      bubbleTimer = null
    }
    bubble.classList.remove('is-show')
    // 等淡出动画结束再 hidden，避免突兀消失。
    setTimeout(() => {
      if (!bubble.classList.contains('is-show')) bubble.hidden = true
    }, 220)
  }
  const say = (text: string): void => {
    const t = text.trim()
    if (t.length === 0) return
    bubble.textContent = t // textContent 而非 innerHTML：防 XSS（内容含模型输出）
    bubble.hidden = false
    void bubble.offsetWidth // 重排以触发淡入过渡
    bubble.classList.add('is-show')
    if (bubbleTimer) clearTimeout(bubbleTimer)
    bubbleTimer = setTimeout(hideBubble, BUBBLE_LINGER_MS)
  }

  return { el, chatButton, setMood, setImage, setSprite, setGifSet, flashAttention, say, hideBubble }
}
