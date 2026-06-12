// 精灵图播放器：一张图按「行=状态、列=帧」切分，rAF 分帧循环播放，按情绪切行。
export interface SpriteConfig {
  dataUrl: string
  rows: number
  cols: number
  fps: number
}

export interface SpriteHandle {
  el: HTMLDivElement
  setRow: (row: number) => void
  stop: () => void
}

const DISPLAY_W = 168

export function createSprite(cfg: SpriteConfig): SpriteHandle {
  const cols = Math.max(1, Math.floor(cfg.cols))
  const rows = Math.max(1, Math.floor(cfg.rows))
  const interval = 1000 / Math.max(1, cfg.fps)

  const el = document.createElement('div')
  el.className = 'pet__sprite'

  let displayH = DISPLAY_W
  let col = 0
  let row = 0
  let rafId = 0
  let lastTs = 0

  const paint = (): void => {
    el.style.backgroundPosition = `-${col * DISPLAY_W}px -${row * displayH}px`
  }

  const loop = (ts: number): void => {
    rafId = requestAnimationFrame(loop)
    if (lastTs !== 0 && ts - lastTs < interval) return
    lastTs = ts
    col = (col + 1) % cols
    paint()
  }

  const img = new Image()
  img.onload = (): void => {
    const frameW = img.naturalWidth / cols
    const frameH = img.naturalHeight / rows
    displayH = Math.round(DISPLAY_W * (frameH / Math.max(1, frameW)))
    el.style.width = `${DISPLAY_W}px`
    el.style.height = `${displayH}px`
    el.style.backgroundImage = `url(${cfg.dataUrl})`
    el.style.backgroundSize = `${cols * DISPLAY_W}px ${rows * displayH}px`
    el.style.backgroundRepeat = 'no-repeat'
    paint()
    rafId = requestAnimationFrame(loop)
  }
  img.src = cfg.dataUrl

  return {
    el,
    setRow: (r: number): void => {
      row = Math.max(0, Math.min(rows - 1, r))
      paint()
    },
    stop: (): void => cancelAnimationFrame(rafId)
  }
}
