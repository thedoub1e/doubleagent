import { contextBridge, ipcRenderer } from 'electron'

// 最小桥接面：渲染层只能调到我们显式暴露的安全方法（contextIsolation）。
const api = {
  /** 切换点击穿透：true=透明区点击穿透到桌面；false=窗口可交互。 */
  setIgnore: (ignore: boolean): void => {
    ipcRenderer.send('pet:set-ignore', ignore)
  },
  /** 手动拖动：发送鼠标全局位移增量，主进程据此偏移窗口。 */
  dragBy: (dx: number, dy: number): void => {
    ipcRenderer.send('pet:drag-by', dx, dy)
  }
}

contextBridge.exposeInMainWorld('api', api)

export type PetApi = typeof api
