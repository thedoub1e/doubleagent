import { join } from 'node:path'
import { app, BrowserWindow, ipcMain, screen } from 'electron'

// 桌宠窗口尺寸（含小狗 + 气泡按钮 + 状态条的留白）。
const PET_WIDTH = 240
const PET_HEIGHT = 300
const MARGIN = 24

let petWindow: BrowserWindow | null = null

function createPetWindow(): void {
  const { workArea } = screen.getPrimaryDisplay()
  const x = workArea.x + workArea.width - PET_WIDTH - MARGIN
  const y = workArea.y + workArea.height - PET_HEIGHT - MARGIN

  petWindow = new BrowserWindow({
    width: PET_WIDTH,
    height: PET_HEIGHT,
    x,
    y,
    frame: false,
    transparent: true,
    resizable: false,
    movable: true,
    alwaysOnTop: true,
    skipTaskbar: true,
    hasShadow: false,
    fullscreenable: false,
    webPreferences: {
      preload: join(__dirname, '../preload/index.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false
    }
  })

  // 常驻置顶、且在所有桌面/全屏空间可见，符合「桌宠」的陪伴属性。
  petWindow.setAlwaysOnTop(true, 'floating')
  petWindow.setVisibleOnAllWorkspaces(true, { visibleOnFullScreen: true })

  // 默认「可交互」，避免启动即忽略鼠标导致点不动/拖不动的死锁。
  // 点击穿透由渲染层按指针是否在小狗上，通过 pet:set-ignore 动态切换。
  petWindow.setIgnoreMouseEvents(false)

  if (process.env.ELECTRON_RENDERER_URL) {
    petWindow.loadURL(process.env.ELECTRON_RENDERER_URL)
  } else {
    petWindow.loadFile(join(__dirname, '../renderer/index.html'))
  }

  petWindow.on('closed', () => {
    petWindow = null
  })
}

// 点击穿透开关：ignore=true 时透明区域的点击穿透到桌面；forward:true 让鼠标移动事件
// 仍转发给渲染层，使指针移回小狗时能被检测到并切回可交互。
ipcMain.on('pet:set-ignore', (_event, ignore: boolean) => {
  if (!petWindow) return
  petWindow.setIgnoreMouseEvents(ignore, { forward: true })
})

// 手动拖动：渲染层按鼠标全局位移发增量，主进程据当前位置偏移窗口（不依赖 -webkit-app-region）。
ipcMain.on('pet:drag-by', (_event, dx: number, dy: number) => {
  if (!petWindow) return
  const [x, y] = petWindow.getPosition()
  petWindow.setPosition(Math.round(x + dx), Math.round(y + dy))
})

app.whenReady().then(() => {
  createPetWindow()
  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createPetWindow()
  })
})

// 桌宠是常驻应用：macOS 上关掉窗口不退出（保持 Dock 存在以便再次唤起）。
app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit()
})
