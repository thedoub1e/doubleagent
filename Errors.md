# Errors — 错题本（踩坑 + 解法）

> 记录每个错误、根因、解法，避免重复踩坑。只增不改。
> 格式： [YYYY-MM-DD HH:MM] 现象 → 根因 → 解法
> Created: 2026-06-12

## 预判坑位（实现阶段逐一验证 / 补充解法）
- 对方没装 Node → 安装.command 先装 Homebrew 再 brew install node，并检测版本。
- 网络慢 / npm 装不动 → 教程提供 npm 国内镜像（npmmirror）切换说明。
- Gatekeeper「无法验证开发者」→ 用「从源码 npm start 运行」而非打包 .app 规避；若仍弹窗，教程给「右键→打开」或 xattr -dr com.apple.quarantine 兜底图文。
- Apple Silicon vs Intel 架构 → Electron/Node 用对应架构；脚本里 uname -m 检测。
- API Key 泄漏进 git → .gitignore 屏蔽 .env/本地配置；仓库只放 .env.example。

---

## 实战踩坑
- [2026-06-12 15:13] npm install 报 ERESOLVE：现象——root 装 vite@^6，但 electron-vite@2.3.0 的 peer 只认 vite ^4||^5，依赖树解析失败。根因——pin 了过旧的 electron-vite。解法——electron-vite 最新稳定版 5.0.0 已支持 vite ^5||^6||^7，package.json 改 electron-vite:^5.0.0 后重装。教训：脚手架定版前先 npm view <pkg> peerDependencies 核对 peer 区间。
- [2026-06-12 15:40] 桌宠点不动也拖不动：现象——狗显示正常但点击/拖动无反应。根因——窗口启动即 setIgnoreMouseEvents(true,{forward:true})，依赖渲染层 mouseenter 翻转为可交互；但置顶+skipTaskbar 无焦点窗口的鼠标转发不可靠，mouseenter 从未触发→窗口永久忽略鼠标→点击穿透到桌面、-webkit-app-region 拖动同时失效（单一根因双症状）。解法——改为：窗口默认可交互(ignore=false)；弃用 app-region 改手动拖动(mousedown 记 screenX/Y→IPC dragBy 增量移动窗口)；点击穿透改用 document mousemove + elementFromPoint 判断指针是否在 .pet 上，只在落到透明背景时才 ignore(forward:true)，拖动中强制不 ignore。
- [2026-06-12 15:55] 点击切表情无反应：现象——能拖动但点气泡按钮表情不变。根因——setMood 用 SVG <g>.innerHTML=FACE 注入子节点，innerHTML 在 SVG 元素上解析出的 circle/path 落入 HTML 命名空间不渲染（初始脸因走整段<svg>经HTML解析器故正常）。解法——setMood 改为重建整段 stage.innerHTML=dogSvg(FACE[mood])，走 HTML 解析器路径保证 SVG 命名空间正确。
