import './styles/pet.css'
import { createDog, type Mood } from './pet/dog'

const root = document.getElementById('pet-root')
if (!root) throw new Error('pet-root not found')

const dog = createDog()
root.appendChild(dog.el)

// 点击小狗 = 打开/收起聊天面板。情绪由主进程按对话状态广播。
function triggerChat(): void {
  window.api.toggleChat()
}

const VALID_MOODS: Mood[] = ['idle', 'thinking', 'reply']
window.api.onMood((mood) => {
  if ((VALID_MOODS as string[]).includes(mood)) dog.setMood(mood as Mood)
})

// 提醒触发：小狗蹦一下吸引注意。
window.api.onAttention(() => {
  dog.el.classList.remove('pet--attention')
  void dog.el.offsetWidth // 强制重排以重启动画
  dog.el.classList.add('pet--attention')
})

// 自定义形象（用户上传的图片/GIF）；null 表示用回自绘狗。
window.api.onPetImage((dataUrl) => dog.setImage(dataUrl))

// ---- 点击穿透 ----
// 窗口默认可交互。鼠标移动时用 elementFromPoint 看落点是否在小狗(.pet)上：
// 在 → 可交互；落到透明背景 → 切点击穿透(ignore)。只在状态变化时发 IPC。
let ignoring = false
function applyIgnore(next: boolean): void {
  if (next === ignoring) return
  ignoring = next
  window.api.setIgnore(next)
}

function isOnPet(clientX: number, clientY: number): boolean {
  const el = document.elementFromPoint(clientX, clientY)
  return !!el && !!el.closest('.pet')
}

// ---- 点击 vs 拖动 ----
// 整只狗都是热区：按下不动松开=点击(开聊天)；按下移动超过阈值=拖动窗口。
const DRAG_THRESHOLD = 4
let pressing = false
let moved = false
let startX = 0
let startY = 0
let lastX = 0
let lastY = 0

dog.el.addEventListener('mousedown', (e) => {
  if (e.button !== 0) return
  pressing = true
  moved = false
  startX = lastX = e.screenX
  startY = lastY = e.screenY
  e.preventDefault()
})

window.addEventListener('mousemove', (e) => {
  if (pressing) {
    const dx = e.screenX - lastX
    const dy = e.screenY - lastY
    lastX = e.screenX
    lastY = e.screenY
    if (Math.abs(e.screenX - startX) > DRAG_THRESHOLD || Math.abs(e.screenY - startY) > DRAG_THRESHOLD) {
      moved = true
    }
    if (moved && (dx !== 0 || dy !== 0)) window.api.dragBy(dx, dy)
    applyIgnore(false)
    return
  }
  applyIgnore(!isOnPet(e.clientX, e.clientY))
})

window.addEventListener('mouseup', () => {
  if (pressing && !moved) triggerChat()
  pressing = false
})

dog.setMood('idle')
