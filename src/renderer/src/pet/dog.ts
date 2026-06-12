// 占位线条小狗（自绘扁平风，原创 fallback）。后续会替换为现成线条小狗素材 / 用户上传图片。
// 三态情绪：idle 待机 / thinking 思考 / reply 回复。仅靠换「脸」表达，身体不变。

export type Mood = 'idle' | 'thinking' | 'reply'

const CAPTION: Record<Mood, string> = {
  idle: '待机中',
  thinking: '思考中…',
  reply: '汪！'
}

// 每个脸是一段 SVG，注入到 <g class="pet__face">，坐标基于头部圆心 (90, 92)。
const FACE: Record<Mood, string> = {
  idle: `
    <circle cx="74" cy="94" r="4.5" fill="#1a1a1a" />
    <circle cx="106" cy="94" r="4.5" fill="#1a1a1a" />
    <path d="M82 112 q8 7 16 0" fill="none" stroke="#1a1a1a" stroke-width="3" stroke-linecap="round" />
  `,
  thinking: `
    <path d="M68 92 q6 -7 12 0" fill="none" stroke="#1a1a1a" stroke-width="3" stroke-linecap="round" />
    <path d="M100 92 q6 -7 12 0" fill="none" stroke="#1a1a1a" stroke-width="3" stroke-linecap="round" />
    <circle cx="90" cy="114" r="2.6" fill="#1a1a1a" />
  `,
  reply: `
    <path d="M68 96 q6 6 12 0" fill="none" stroke="#1a1a1a" stroke-width="3" stroke-linecap="round" />
    <path d="M100 96 q6 6 12 0" fill="none" stroke="#1a1a1a" stroke-width="3" stroke-linecap="round" />
    <path d="M80 110 q10 11 20 0" fill="none" stroke="#1a1a1a" stroke-width="3" stroke-linecap="round" />
  `
}

const dogSvg = (face: string): string => `
<svg class="pet__svg" viewBox="0 0 180 200" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
  <path d="M138 152 q28 -6 18 -30" fill="none" stroke="#1a1a1a" stroke-width="4" stroke-linecap="round" />
  <ellipse cx="90" cy="152" rx="46" ry="34" fill="#fff" stroke="#1a1a1a" stroke-width="4" />
  <path d="M72 184 v9 M108 184 v9" stroke="#1a1a1a" stroke-width="4" stroke-linecap="round" />
  <circle cx="90" cy="92" r="46" fill="#fff" stroke="#1a1a1a" stroke-width="4" />
  <path d="M50 64 q-16 6 -10 30 q12 4 18 -10 z" fill="#fff" stroke="#1a1a1a" stroke-width="4" />
  <path d="M130 64 q16 6 10 30 q-12 4 -18 -10 z" fill="#fff" stroke="#1a1a1a" stroke-width="4" />
  <circle cx="90" cy="103" r="3.4" fill="#1a1a1a" />
  <g class="pet__face">${face}</g>
</svg>`

export interface Dog {
  el: HTMLDivElement
  chatButton: HTMLButtonElement
  setMood: (mood: Mood) => void
}

export function createDog(): Dog {
  const el = document.createElement('div')
  el.className = 'pet'
  el.innerHTML = `
    <button class="pet__chat" type="button" title="打开聊天" aria-label="打开聊天">💬</button>
    <div class="pet__stage">${dogSvg(FACE.idle)}</div>
    <div class="pet__caption">${CAPTION.idle}</div>
  `

  const chatButton = el.querySelector('.pet__chat') as HTMLButtonElement
  const stage = el.querySelector('.pet__stage') as HTMLDivElement
  const caption = el.querySelector('.pet__caption') as HTMLDivElement

  const setMood = (mood: Mood): void => {
    // 重建整段 SVG：经 HTML 解析器路径，<circle>/<path> 才会落到正确的 SVG 命名空间。
    // （直接对 SVG <g> 设 innerHTML 会落到 HTML 命名空间而不渲染。）
    stage.innerHTML = dogSvg(FACE[mood])
    caption.textContent = CAPTION[mood]
    stage.dataset.mood = mood
  }

  return { el, chatButton, setMood }
}
