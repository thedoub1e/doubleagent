# Append-Only Log (AOL)

> Append-only. Never edit or delete past entries. Add entries only via
> `bash ~/.claude/hooks/aol-append.sh "/Users/caizhizhi/doublesCodes/项目/doubleagent" "<message>"`.
- [2026-06-12 14:22:01 +0800] fr0m init: 建 doubleagent/ 子仓(git) + Principal/Plan/Errors/AOL；定稿推荐架构(Electron 单栈+从源码运行+OpenAI兼容模型层，参考Clarvis不fork)；等用户确认计划后再动代码
- [2026-06-12 14:22:34 +0800] 新增 .gitignore：屏蔽 .env/密钥/node_modules/dist 等；保留 .env.example。结果：密钥从第一天起不进 git
- [2026-06-12 14:33:23 +0800] 讨论目标：拍板四项 Open Question —— Electron 单栈+从源码运行+不fork Clarvis；默认自绘线条小狗+支持用户上传图片自定义；首版纯文字MVP+对话记忆；模型预设新增MiniMax(共六源)默认留空。已折进 Plan.md 定稿
- [2026-06-12 14:38:56 +0800] 形象来源修正：调研线条小狗资源——确认是 moonlab_studio 版权IP无开源授权，仅免费合集(爱给网/简书/Sigstick)可个人非商用。改用现成免费素材映射三态+保留上传+自绘fallback，仓库定 private 规避再分发风险。已折进 Plan。确认 gh 已登录 thedoub1e 可直接建库
- [2026-06-12 14:40:20 +0800] 建库：git commit 治理基线(5文件) + gh 创建私有仓库 github.com/thedoub1e/doubleagent，push main 成功，origin 已绑定
- [2026-06-12 14:42:46 +0800] 产品用意补充：交付对象=国外留学伴侣，定位数字陪伴者，须实现陪伴/监督/聊天/解惑四功能，默认人设=留学陪伴小狗。已折进 Plan(新增「产品用意」段+变更日志)。挂起待确认：监督是否首版做主动提醒；是否同步写进 Principal 的 End Goal
- [2026-06-12 14:49:18 +0800] 拍板两项：(1)监督首版即做主动定时提醒/打卡+macOS系统通知(加轻量调度器)，已加进首版范围/TODO；(2)四大功能用意写进 Principal End Goal——经 .principal-unlock 解锁→编辑→重新上锁。Plan 同步更新 TODO/Open Questions/变更日志
- [2026-06-12 14:58:15 +0800] 重评估piagent：查实 Pi(@earendil-works/pi-ai,MIT,TS) 与单栈兼容，原生支持DeepSeek/MiniMax/GLM/Kimi+任意OpenAI兼容(通义/Gemini反代)，白送流式+工具调用+成本统计+上下文持久化。决定改用pi-ai作模型层弃手写；记忆学Clarvis但用TS轻量实现(其Hindsight/Cognee是Python不搬)；不引pi-tui/bash工具。已折进Plan。挂起待确认：接受pi-ai较重依赖取舍
- [2026-06-12 14:59:14 +0800] 用户拍板：模型层采用 pi-ai(功能优先)，接受依赖变重；运行时只配国产源/Gemini反代不调OpenAI/Anthropic。Plan 中该 Open Question 结案
- [2026-06-12 15:29:09 +0800] 搭好 Electron 单栈骨架：package.json/electron.vite.config.ts/tsconfig + src/main(透明置顶可拖动窗口+IPC切点击穿透)/preload(contextBridge最小API)/renderer(自绘三态占位线条小狗+悬停气泡按钮)。.env.example 列六源。装依赖踩 ERESOLVE(electron-vite升5)+Electron二进制走npmmirror镜像兜底(均记Errors)。typecheck/build/boot 全过，桌宠空壳跑通
- [2026-06-12 15:42:24 +0800] 修复桌宠点不动/拖不动：根因是启动即 ignoreMouseEvents(true) 靠 mouseenter 翻转但无焦点窗口转发不可靠→永久忽略鼠标。重做为：窗口默认可交互+手动拖动(mousedown记screenX/Y→IPC dragBy增量移窗,弃 app-region)+穿透改 mousemove+elementFromPoint 判定(.pet 上=可交互,透明背景=穿透)。另：之前被 kill 的 npm install 异步回滚清空了 node_modules,已带 npmmirror 干净重装。typecheck/build/boot 全过(均记 Errors)
- [2026-06-12 15:53:02 +0800] 修复点击切表情无反应：根因 setMood 对 SVG <g> 设 innerHTML 导致子节点落 HTML 命名空间不渲染；改为重建整段 SVG(stage.innerHTML=dogSvg(FACE[mood]))。typecheck/build 通过(记 Errors)
- [2026-06-12 16:18:06 +0800] 改进点击交互：原来只有 30px 悬停浮现的小气泡可点(判定太小)。改为整只狗都是热区——点击vs拖动用4px阈值区分:按下不动松开=开聊天(占位切表情),按住移动=拖窗。气泡按钮降为视觉提示。typecheck/build 通过
- [2026-06-12 16:22:08 +0800] 提交并推送可交互骨架(01978c6)。定默认源 MiniMax，装 @earendil-works/pi-ai 探测：provider minimax(国际api.minimax.io)/minimax-cn；模型 M2.7/M2.7-highspeed/M3；api=anthropic-messages(走MiniMax自家anthropic兼容端点,底层用@anthropic-ai/sdk但数据只发MiniMax,红线实质守住);key调用时{apiKey}传入存主进程。已记 Plan。待确认协议细节+默认模型后开建聊天
- [2026-06-12 16:48:15 +0800] 接好聊天MVP：主进程 config.ts(含陪伴人设默认+key存userData不回传明文)/history.ts(本地历史持久化)/chat.ts(pi-ai动态import流式,key只在主进程)/index.ts(新增聊天窗+IPC编排:chat:send→pi-ai流式→delta推聊天窗+驱动小狗情绪thinking/reply/idle)；preload合并api；renderer新增chat.html+chat.ts+chat.css(类Gemini气泡/流式/设置抽屉/Enter发送)；pet点击改toggleChat,情绪由主进程广播。electron-vite加chat入口。typecheck/build/boot全过。真实MiniMax调用待key端到端验证
