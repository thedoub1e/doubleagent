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
- [2026-06-12 16:20] MiniMax 真实调用 401 authentication_error(invalid...)：现象——pi-ai getModel(minimax,MiniMax-M3) 走 api.minimax.io/anthropic,传 {apiKey} 调用返回 401 鉴权失败(key 是 sk-cp- Coding Plan,125 长度,确认已读到)。疑因——pi-ai 的 anthropic-messages 默认按标准 Anthropic 发 x-api-key 头,但 MiniMax anthropic 兼容端点要 Authorization: Bearer(Claude Code 的 ANTHROPIC_AUTH_TOKEN 模式)。待查官方接法验证+修头。
- [2026-06-12 16:35] MiniMax 401 解决：curl 直打确认——不是鉴权头问题(Bearer/x-api-key 都行)，是站点错了。key 是 MiniMax 国内站(api.minimaxi.com,多个i)申请的,国际站 api.minimax.io 一律 401 invalid api key。pi-ai 的 complete/stream 不认 options.baseUrl 覆盖,须切 provider。解法——config 默认 provider 由 minimax 改 minimax-cn(端点 api.minimaxi.com/anthropic,同样有 M3/M2.7/highspeed)。实测 minimax-cn 流式+非流式均 200,陪伴人设回复正常。注:国内站 key,伴侣在国外需确认 api.minimaxi.com 可达(公网 API 通常可入)。
- [2026-06-13 15:20] 工具调用冒烟测试 ByteString 报错：现象——临时 smoke 脚本调 MiniMax 一律报 "Cannot convert argument to a ByteString...index 13 value 65288(（)"，与是否带 tools/中英文无关。根因——脚本用整文件正则 /MINIMAX_API_KEY=.../(无锚点)取 key，误匹配到 .env 里一行被注释的占位示例「…（你的真实Key）…」，全角括号进了 X-Api-Key 头。非 app bug：app 的 env.ts 逐行解析会跳过 # 注释行，用另一行真实 125 字符 key。解法——smoke 改用 app 同款逐行解析(跳注释+去引号)后工具调用一次通过(模型吐 create_reminder + 相对日期 明天→2026-06-14 正确)。教训：解析 .env 必须逐行跳注释，别用贪婪整文件正则。
- [2026-06-13 16:41] Open-Meteo 地理编码 language=zh 把英文城市名错配 → 现象：查 "New York" 用 language=zh 返回「约克(内布拉斯加)」lat40.86/lon-97.59，而非纽约市；但 language=en 查中文「北京」又返回无 results。根因：geocoding 的 language 参数同时影响本地化显示名与候选排序，跨脚本输入会错排/失配。解法：weather.ts geocodeLanguage(city) 按输入是否含中日韩字选 zh/en（含 CJK→zh，否则→en），buildGeocodeUrl 据此拼 language；实机验证 New York(en)→纽约、北京(zh)→北京 均正确。加单测锁住。
- [2026-06-13 16:57] dev 启动崩溃 ERR_PACKAGE_PATH_NOT_EXPORTED (@earendil-works/pi-ai) → 现象：npm run dev，electron app 加载即抛「No "exports" main defined in pi-ai/package.json」白屏不启动。根因：chat.ts 顶部 `import { Type } from '@earendil-works/pi-ai'` 是静态值导入；pi-ai 的 package.json exports 只给了 ESM "import" 条件、无 "require"，而 electron-vite 把 node_modules 依赖 externalize、主进程是 CJS → 静态导入编译成 require() 解析失败。其余调用都用动态 import() 规避了，唯独上个 session 加 createReminderTool 时引入的 `Type`(TypeBox,来自 typebox 再导出) 是静态值导入，且那之后没在 dev 实跑过故未暴露。解法：删掉该静态导入，工具 parameters 改为手写「纯 JSON Schema 对象」(TypeBox Type.Object 运行时本就序列化成等价 JSON Schema,发给模型一致)，加 defineTool() 帮手 + `as unknown as Tool` 转型；`import type { Tool, ToolCall }` 是纯类型导入、编译期擦除无运行时依赖故保留。修后 dev 正常启动、108测/typecheck 全过。教训：静态 import 任何 ESM-only 包到 CJS 主进程都会炸，新增 pi-ai 相关一律走动态 import 或纯类型导入。
- [2026-06-14 17:30] 聊天回复显示红色「[object Object]」(用户截图,在纠正「不是花生是海鲜」时触发) → 根因：chat.ts runChat 里 `handlers.onError(String(event.error))`，pi-ai 的 error 事件 error 字段是**对象**时 `String(对象)`="[object Object]"，把真实错误吞了 → 解法：加 errToText(err) 安全提取(string 原样/Error 取 .message/对象取 message·error 字段/兜底 JSON.stringify)，runChat 两处 onError 都改用它；渲染层 onError 也加防御(非字符串取 .message 或兜底文案)。真实错误信息今后会显示出来，便于定位底层 API 是否真出错(可能为一次性网络/限流)。
