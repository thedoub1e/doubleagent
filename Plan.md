# Plan

_单一事实来源（Source of truth）。始终保持本文件最新。_
_Last updated: 2026-06-14_

## Current Objective（2026-06-14 重大方向升级 — 用户拍板 Path B）
**新北极星**：把小狗从"会聊天+会提醒的桌宠"升级成 **"对标 Claude Code 实干能力、但有人情味、记忆全自动的桌面助手"**——
送给**在国外留学、不懂电脑**的伴侣。让一个电脑小白**零心智负担**地享受 agent 的提效与魅力：
能**真的在她电脑上做事**(查改文件/跑命令/上网办事/**修电脑小毛病·疑难杂症**/必要时自我修复)，
但把这份能力**包进一只懂她、有人情味的小狗**里，且**记忆全自动**(她永远不用手动管上下文)。

**为什么不直接用 Claude Code**：Claude Code 能力够，但 ① **冷、没人情味** ② **要手动管理记忆/上下文**，
电脑小白搞不定。我们要的 = **Claude Code 的能力 + 陪伴的温度 + 自动的记忆**。三者缺一不可，Claude Code 只占第一个。

**实现路线 = Path B（2026-06-14 拍板）**：**把 nanobot 的工具层(手脚)移植进我们自己的轻量 TS**，
不引 Python 后端、不套 Claude Code/Anthropic、不破单栈——守住 Principal 的"国产模型/可审计/电脑小白保姆级安装"红线。
= **Clarvis 的魂(记忆+情绪脸,已做) + nanobot 的手脚(工具,待移植) + 我们自研的壳(桌宠/多会话/macOS,已做)**。
详见 §「能力引擎升级方案（Path B）」。

**北极星四支柱（设计时对照）**：① **能干**(可扩展 skill/tool 引擎,真动手解决问题) ② **人情味**(全程小狗人设,
把"技术"说成"关心",不甩终端输出) ③ **自动记忆**(结构化画像+摘要,越用越懂她,零手动 — **已做**) ④ **小白安全**
(危险操作温柔确认+沙箱+保守默认,绝不让她误伤电脑)。

**与旧主线的关系**：旧主线二(主动 agent:提醒/简报/番茄钟…)与主线一(结构化记忆/多会话)**均已落地**，
现作为新北极星的支柱③(自动记忆)与既有能力并入新架构，不浪费。旧方案段落保留在下方供追溯。

**⚠️ 治理**：本次扩大了产品能力面，但**未改 Principal.md**(用户只授权改 Plan;End Goal 措辞是否正式更新待用户单独确认)。
新增一条硬约束(下方安全层)：**危险系统操作必须确认+沙箱+保守默认**，与 Principal 的"安全可审计/电脑小白"一致。

## 🎯 能力引擎升级方案（Path B · 用户 2026-06-14 拍板 — 当前主线）

**一句话**：把 nanobot(`~/dev/nanobot`,OpenClaw 砍 99% 代码,MIT,Python)的**工具层移植进我们的 TS**，
把现在"硬编码 if-else 工具串"升级成 **可扩展 skill/tool 注册引擎 + 能力工具(文件/命令/网络/MCP) + 小白安全层 + 人情味翻译**。
provider 无关(国产模型,pi-ai)、单栈 TS、可审计、能力可门控(送伴侣的版本关掉危险 skill)。

**为何是 B 不是 A/C**(详见会话记录)：A=直接拿 nanobot Python 当后端(装 Python,撞保姆级安装);C=套 Claude Code+ccswitch
(Anthropic 工具链撞红线,国产模型下打折,冷)。**B 唯一让我们已有工作 100% 不浪费**：Clarvis 魂(记忆/脸)+ 我们自研壳
(桌宠/多会话/macOS) 全保留，只"长出手脚"。代价=移植 nanobot tools/ ~1800 行(有蓝本照抄,非从0手搓)。

**nanobot 蓝本(已读源码)**：`nanobot/agent/tools/` = registry.py(70,工具注册表) / filesystem.py(238,读写) /
shell.py(158,跑命令) / web.py(181,上网) / mcp.py(148,MCP) / spawn.py(63,子agent) / cron.py(158) / base.py(181)。
`providers/litellm_provider` = DeepSeek/Qwen/Kimi/MiniMax 全支持(我们已有 pi-ai 等价)。`skills/` = tmux/github/weather/
memory/summarize/skill-creator/clawhub(技能市场)。

**实现路线（低风险→高风险，每阶段 TDD + 可独立验收 + 自动测过再交人工）**：

- **Phase 0 · 工具注册表重构(地基,纯重构行为不变) ✅ 已完成 2026-06-14**：
  新 `tools/types.ts`(ToolModule{name,description,parameters,danger?,run(args,ctx)}+ToolContext+ToolResult) /
  `tools/registry.ts`(createRegistry→toolDefs/get/dispatch,单工具抛错隔离不拖垮整轮) /
  `tools/petTools.ts`(13 个生活工具迁成注册模块,定义+执行合一,行为等价)。chat.ts 删掉 13 工具定义+PET_TOOLS+defineTool(ToolResult 改从 tools/types 再导出);
  index.ts 删 handleToolCalls+addCountdown,改 `petRegistry.dispatch(calls,{reminderList,startFocus,stopFocus})` + `petRegistry.toolDefs()`。
  验收:typecheck+172离线(+6 registry)+**12 真模型场景(工具选择行为等价)**+E2E13+build 全过,dev 跑通。加能力从此 = 往 PET_TOOL_MODULES 加一个模块。

- **Phase 1 · 能力工具(手脚,移植 nanobot tools/) ✅ 已完成 2026-06-14**：新 `tools/computerTools.ts` 6 工具——
  read_file/list_dir/search_files(只读·沙箱·敏感文件拦截)、fetch_url(SSRF 闸)、write_file/run_command(danger,经确认)。
  纯安全函数 `tools/safety.ts`(resolveWithinRoots 沙箱·checkCommand 黑名单·isUrlAllowed SSRF·isSensitivePath·truncateOutput)+13测;
  computerTools 集成测 16(真临时目录:读写/列/搜/沙箱越界/敏感拦截/危险命令拦/确认拒绝)。人设 todayHint 告知小狗新能力 + 说人话别甩终端。

- **Phase 2 · 小白安全层(支柱④,Principal 新增硬约束) ✅ 已完成 2026-06-14**：
  危险工具 `danger=true` → **registry 中央把关**(prepare 预校验→不过直接拒/过了 ctx.confirm 弹确认→同意才 run，单工具忘了也兜得住)；
  渲染层**确认卡片**(显示将执行内容 + 允许/不行,E2E 验证)；index.ts requestConfirm IPC 往返(无窗口/超时 90s=保守拒绝)；
  沙箱限主目录、shell 黑名单(rm -rf/拆分标志/sudo/dd/关机/forkbomb/下载即执行/进程替换)+20s 超时+cwd 限定；
  **审计日志** auditLog.ts(防换行注入);敏感凭据文件(.ssh/.aws/密钥/keychain)读写都拒。
  **安全审查**(security-reviewer 子代理)无 CRITICAL;修了 MEDIUM(rm 拆分标志绕过/符号链接越界/danger 中央强制) + LOW(SSRF IPv6 映射·链路本地/审计换行/写预览字数) + HARDENING(敏感文件拦截)。

- **Phase 3 · 人情味翻译层(支柱②) ✅ 基本由现有架构覆盖**：多轮工具循环把工具结果回喂模型,模型以小狗人设组织成人话(已验:
  「磁盘还剩多少」→ run_command → 模型说人话回复);人设已指示"别甩原始终端输出、失败也温柔、说人话"。后续如需更强的输出折叠再单独做。

- **Phase 4 · MCP 接入(无限扩展)**：移植 nanobot mcp.py,连 MCP server 把其工具纳入 registry → 能力插件式增长。

- **Phase 5 · 子agent / 技能扩展(后期可选)**：spawn 子agent 处理复杂任务;skill-creator 式自助扩能力。

**守红线对照**：① 国产模型=pi-ai 不变(不碰 Anthropic) ② 单栈 TS=移植非引 Python ③ 可审计=自己写/移植可读
④ 电脑小白=安装不变(只 Node)+危险操作确认 ⑤ 安全=Phase 2 沙箱/确认/审计。

**现有工作如何归位(不浪费)**：自动记忆(画像/摘要/多会话)=支柱③**已做**;既有生活工具(提醒/日历/天气/番茄钟)
=Phase 0 迁成 registry 模块;桌宠/情绪脸/Apple 聊天窗/macOS 原生=产品的"脸",保留。

**下一步**：从 **Phase 0(工具注册表重构)** 起手——纯重构、行为等价、风险最低、是后面所有能力的地基。

## 📌 现状速览 + 待办队列（2026-06-15 更新，供新会话接手 — 先读这段）

**dev 在跑**：`nohup npm run dev`（单实例）。常规 `npx vitest run`=**250 过+26 跳过**。`npm run test:e2e`=**23 过**（含自更新/自启动设置 UI 真驱动）。`npm run typecheck` 现覆盖 `src`+`test`（tsconfig.typecheck.json）。联网真模型测试(gated `SCENARIO_LIVE=1`)：`test/scenario.live.test.ts`(工具选择+情绪+多轮) 与 **`test/capability.live.test.ts`(8 全量能力:真模型+真工具+真沙箱,断真实文件效果+安全+不编造,密钥零泄露)**。E2E：`npm run test:e2e`(16,含安全确认卡片)。.env 有 MINIMAX key。关 dev：`pkill -f "doubleagent/node_modules/electron"`。
**人工验收手册**：`验收清单.md`(A~F 共 40 项；F 节=本程新增 set_briefing/自启动/自更新)。

**🆕 本程(2026-06-15 下午)做完**：① 小优化三连(set_briefing 对话改简报/画像注入预算 top-N `selectInjectableFacts`/抽取 debounce 8s) ② 开机自启动(设置面板勾选,修了「从源码运行 app.isPackaged 恒 false → 自启动永久静默失效」隐患,改 path+args) ③ README 功能介绍补全(agent 实干/生活帮手/陪伴,口语化) ④ **撤除 Google Maps 附近推荐**(用户先做后撤,find_nearby/Maps 密钥整套删,做饭建议保留) ⑤ **MCP 接入暂缓·标 backlog**(用户拍板 YAGNI) ⑥ **自更新(热升级)实现**(updateUtil/updater/migrate,git clone 式,pull→build→relaunch+失败回滚+dataVersion 迁移+迁移前备份,设置「检查更新」UI,README clone-only;245 测全过)。常规 `npx vitest run`=**245 过+26 跳**。
**⏳ 仅剩真机/真网收尾(我替不了,待用户)**：README 截图(真机截屏放 docs/screenshots/)、伴侣国外测 api.minimaxi.com 可达、自启动一次 logout/login 验证、提醒事项首次 TCC 授权验收(薄片 v0 唯一剩项)。

**🟢 已完成大块(2026-06-14~15，均测过+提交)**：
- **Path B 能力引擎 Phase 0~3 完成**：tools/ 注册引擎(registry+types)；能力工具 read_file/list_dir/search_files/web_search(Bing)/fetch_url/write_file/run_command（find_nearby/Google Places 已于 2026-06-15 按用户要求撤除）；小白安全层(safety.ts 沙箱/shell黑名单/SSRF/敏感文件 + danger 工具 registry 中央把关 prepare→确认→run + 确认卡片 UI + auditLog)；人情味由多轮循环+人设覆盖。Phase 4 MCP 未做。
- **多会话+全局画像+靠谱护栏**(sessions.ts/左侧栏)；**记忆护栏**(低置信不注入/保守抽取/纠正高置信/手改权威/**吐槽气话不记负面**)；**情绪支持**(倾听者,先共情不塞工具)；**人设重平衡**(先接住话、工具克制不推销、绝不编造文件内容)。
- **思考过程披露 UI**(💭 思考中→流式思考可收起 + 🔍 正在上网查/⚙️ 跑命令 活动状态)；**总结式会话标题**;主动消息只走通知+头顶气泡不进对话框。
- **联网修复**：`setDefaultResultOrder('ipv4first')` 修 Node fetch IPv6 死路由超时 + web_search(Bing 宽容解析)。

**🔴 重要定位(2026-06-15)**：她是 **i 人(内向)** → 做**贴心生活助手+陪伴**，不是沟通工具。新功能优先生活助手属性。
**❌ 不做**：小红书爬虫(用户后续单独项目)；Google Maps 附近推荐(2026-06-15 先做后撤,见下)。**💡 待议**：每天找房源(自动 listings 不可行,见下方)。
**人工验收已发现并修的 3 真问题(2026-06-14)**：①危险操作确认时窗口被失焦隐藏→用户得重开:blur 守卫(pendingConfirms.size>0 不隐藏)+requestConfirm 先登记再 showChat;②确认卡片后回答错位在卡片上方→确认时移除当前流式气泡,全文于卡片下方新气泡渲染(onDone 兜底补气泡);③**模型编造文件内容**(假装读了 ~/.ssh/id_rsa 私钥,实际 read_file 已拒)→人设加「绝不编造铁律」(文件/命令事实必须用工具拿真实结果,拒绝就如实说,绝不假装看过)+「只读优先用专门工具免确认」。全量能力测试验证:拒读密钥零泄露+不编造。
关掉残留 Electron 用 `pkill -f "doubleagent/node_modules/electron"`（参数仅 `.`，普通 pkill 匹配不到）。

**「小狗眼中的你」(结构化画像) 现状**：
- 抽取=每轮 assistant onDone → extractProfile 取最近4条+现有facts → **信号门控**(无新信息模型返[]→不写)。无固定轮数门槛(语义判断)，明确事实一轮即沉淀、闲聊不沉淀。
- 结构=5类(identity/preference/concern/commitment/trait)×ADD/UPDATE(矛盾覆盖)/DELETE，上限60(MAX_FACTS,淘汰最旧非constant)。可挂更便宜记忆模型(config.memoryModel)。
- UI=设置面板「小狗眼中的你」**逐条可编辑(input change→profile.update)+单条删(×→remove)+清空(已两步确认 confirmable 防误触)**。✓误触防护已做 ✓可编辑非只能清空。
- 待打磨：编辑「可改」不够明显(看着像普通文字，**仍待做**)；~~停顿/空闲 debounce 抽取~~ ✅ 已完成 2026-06-15(8s 停顿后抽一次)。

**上下文管理(防降智) 现状**：runChat 只发**最近30条**(MAX_CONTEXT_MESSAGES)给模型,非全量;超24条(SUMMARIZE_THRESHOLD)把更旧的滚动压缩进摘要(memory.json)注入人设=我们的"压缩"。注入=人设+摘要(叙事)+画像(事实)+当前时间。降智/token已架构兜住。

**会话管理 现状(✅ 已升级为多会话)**：sessions.json 单文件存所有会话的「可见历史+滚动摘要」(隔离层,互不串味)；画像 profile.json 全局单份(共享层,跨会话越来越懂你)。左侧栏可新建/切换/双击改名/×两步确认删。「清空对话记录」只清当前会话(不动画像);「清空(画像)」独立按钮。旧 history.json/memory.json 已迁移成默认会话(保留为备份)。
**已拍板(2026-06-14)→ 做多会话 + 全局共享画像**：用户决定把会话管理权交给用户(像 Gemini 分会话聊不同事,线程间上下文不串味=减少幻觉),但**所有会话共用同一套记忆架构**做到"越来越懂她"。关键=记忆分两种、共享层与隔离层拆开:
- 🌍 **画像 profile.json = 全局唯一共享**:所有会话每轮 onDone 都往它沉淀,所有会话都注入它 → 不管在哪个会话说"我过敏/我搬家",小狗都认识同一个你(体感)。
- 🔒 **可见历史 history + 滚动摘要 = 按会话隔离**:每会话各一份,线程间不互相污染(Gemini 式减少幻觉)。
- 形态:会话列表(新建/切换/重命名/删除);主动提醒/简报/找话题投递到**当前活跃会话**;「删某会话」=只删该线程,「忘掉对你的了解」=单独的清画像/长期记忆按钮(明显分开防误删)。详见 §「多会话 + 全局画像 架构方案」。

### 近期人工验收驱动的修复/新增（2026-06-15，均已做+测+提交）
- 联网超时真因=Node fetch 先试死 IPv6 路由挂起 → 启动 `setDefaultResultOrder('ipv4first')`；并加 `web_search` 工具(Bing 后端+宽容解析，DuckDuckGo/Google 从此网络 Node fetch 超时不可用)。
- 思考过程披露(类 Claude Code)：pi-ai `thinking_delta` → 思考面板(💭 思考中→流式思考→收起可点开)+ 活动状态(🔍 正在上网查/⚙️ 跑命令/📂 翻看文件…)。
- 人设重平衡(先接住话、工具克制不推销)；模型编造文件内容→人设加「绝不编造铁律」；确认卡片窗口不再隐藏+回答落卡片下方。

### 🧭 重要定位补充（用户 2026-06-15）：她是「i 人」(很内向) → 做「贴心生活助手 + 陪伴」，不是「沟通工具」
用户澄清：她内向、痛苦多源于此，**不是不会沟通，而是不爱/不擅长到处开口**。所以方向是让小狗**替她把生活的事办了**(吃什么/去哪/办事)、默默贴心陪着，而不是给她"沟通话术工具"。西班牙语沟通助手→**降级酌情**(她痛点不在此)。新功能优先「生活助手」属性：Google Places 位置推荐 + 做饭/吃什么建议 + 基础设施打磨(用户选定)。

### ❌ 已决定不做：小红书爬虫（用户 2026-06-15 拍板：本项目不接，他后面单独新开项目处理）

### 💡 待议新功能：每天找马德里房源（用户 2026-06-15 提，她遇住房噪音+租房旺季）
**想法**：每天在小红书帮她找马德里房源。
**交底**：**小红书直爬不可行/有风险**——它有强反爬(登录+x-s签名+设备指纹+app层加密)，无公开 API，硬爬要么频繁失效、要么得用她登录态(可能被风控封号+违反 ToS)。**给伴侣的礼物不该塞这种脆弱+有风险的东西。**
**实测交底(2026-06-15)**：自动抓「房源列表」整体都难，不止小红书——web_search(Bing)搜「马德里租房」只返回百科/攻略等泛信息，**给不出真实 listings**；idealista/小红书/华人群都强反爬。**结论:可靠地自动聚合 live 房源 = 做不到(或脆弱+有风险)，不该硬塞进礼物。**
**能可靠做的**：① 情绪支持(已做)；② web_search 查**建议/攻略/区域**(「马德里哪些区安静」「怎么跟房东反映噪音」「租房注意事项」)——泛信息够用；③ 小狗给她**正确的找房策略+链接**(idealista 设邮件订阅 alert、华人租房群、小红书 app 搜 X)，而不是替她爬。真要自动 listings，正解是让她在 idealista 官网设一次搜索订阅(官方邮件推送)，非 agent 爬。

**小红书开源项目调研(2026-06-15 实查 GitHub，用户问能否合理个人使用绕反爬)**：
- **NanmiCoder/MediaCrawler** ★51k·Python·活跃(2026-06 push)·NOASSERTION(仅学习非商业)：核心=**Playwright 真浏览器+保存登录态**，在登录上下文里用 JS 表达式取签名参数(**无需 JS 逆向**)，支持小红书关键词搜索/帖子/评论/登录态缓存/IP代理。**这就是"绕反爬"的主流办法——用她登录态的真浏览器算签名。**
- **cv-cat/Spider_XHS** ★6.3k·**JavaScript/Node**·无协议·活跃：Node 实现，**与我们 TS 栈最兼容**(不引 Python)，但无 license(法律含糊)+偏"全域运营"重。
- **ReaJason/xhs** ★2.1k·MIT·Python·2025-07(较旧)：web 端请求封装。
**接入代价/风险(给伴侣礼物需权衡，待用户拍板)**：① 都需**她的小红书登录(扫码/cookie)** → 账号风险:温和频率低但非零(小红书会封自动化账号)，**用她账号自动化的风险是 double 的决定**；② MediaCrawler=Python+Playwright+浏览器(重、撞单栈/保姆级)；Spider_XHS=Node(轻、合栈)但无 license；③ **维护脆弱**:小红书改签名就坏，需持续跟进更新。**结论:技术可行(她登录态+温和频率=合理个人使用)，但要 double 接受账号风险+维护负担。若做，选 Spider_XHS(Node合栈) 或 MediaCrawler(最稳)，做成低频(每天几次)「马德里租房」搜索。待用户拍板。**
**情绪面**：住房噪音让她烦躁→已由「情绪支持(倾听者)」覆盖(先共情再一起想办法)。

### ❌ 已撤除：Google Maps / 位置推荐（用户 2026-06-15 先做后撤）
**经过**：曾实现 find_nearby(Google Places searchText)+设置里 Maps 密钥框，待用户给 key 验收。**用户 2026-06-15 拍板「不搞谷歌地图接入附近吃的了」→ 整套干净移除**(placesTool.ts/test 删、ALL_TOOL_MODULES 去掉、config.mapsApiKey/publicConfig.hasMapsKey/preload/env.d.ts/renderer Maps 密钥框/GOOGLE_MAPS_API_KEY 回退 全删、todayHint 的 find_nearby 路由删)。
**保留**：「不知道吃什么/想做饭/想找附近吃的」→ 小狗结合她口味聊家常菜 + web_search 查菜谱或本地推荐(无需 key、无需 Google)。

## 🔄 自更新（热升级）方案（用户 2026-06-15 提 + 拍板路线，✅ 已实现 2026-06-15）
> 实现见待办 A2 / AOL。下方为原始设计记录，与实现一致。

**需求**：让小狗**自己拉 GitHub 升级**，且**绝不丢她本地已存的记录**（"热升级、不覆盖"）。送电脑小白的礼物，升级不能让她碰命令行。

**✅ 数据安全=架构已天然满足（不用额外做）**：代码与记录是**物理隔离的两个目录**——
- 代码：`~/.../doubleagent/`（git 仓库，升级时整体替换）。
- 记录：`app.getPath('userData')` = `~/Library/Application Support/doubleagent/`，存 `config.json / sessions.json / history.json / memory.json / profile.json(画像) / pomodoro.json / fired.json / audit.log / 自定义形象`，**git 碰不到**。`.env`(API key) 在仓库根但 `.gitignore` 忽略，`git pull`/`git reset --hard`(只清已跟踪文件、不删未跟踪) 都不动它。
- → 升级只换代码目录，记录住在另一个目录。**"不覆盖记录" 已经成立**，缺的只是"自动拉取+重建+重启+失败回滚"的自动化。

**🔧 现状缺口**：① **没有任何自更新机制**（今天升级 = 人手动 `git pull && npm install && npm run build && 重启`）。② 跨版本数据迁移只有零散 ad-hoc（如多会话那次），**无 `dataVersion` 有序迁移框架**。

**✅ 已拍板技术路线（用户 2026-06-15）= git clone + 自更新**（非 ZIP 替换）：
- 前提：她那份代码必须是 **git clone**（有 `.git`）→ **README 安装流程要去掉 ZIP 下载选项，改 GitHub Desktop/clone 唯一路径**，且 git 需在机器上可用（GitHub Desktop 自带）。

**设计（check → 征得同意 → pull → install → build → relaunch，带回滚 + 迁移备份）**：
1. **检查**：定期(或设置里点「检查更新」) `git fetch` 比对本地 HEAD vs `origin/main`（或比 package.json version）。有新版→**头顶气泡问她**「我有新版本啦，要更新吗?」。**绝不静默自动更新**（礼物要稳，给她知情权）。
2. **应用**（她点头后）：记下当前 commit SHA → `git pull --ff-only`（只快进；本地若意外有改动则安全中止）→ 需要时 `npm install`（package-lock 变了才跑）→ `npm run build` → `app.relaunch()+app.exit()` 重启进新代码。全程头顶/聊天窗给进度，别让她干等。
3. **回滚（电脑小白命根子）**：build 或启动失败 → `git reset --hard <旧SHA>` 重建旧版重启，**绝不把她留在打不开的小狗前**；并告诉她「这次没更新成，已回到原来的样子，你的记录都在」。
4. **跨版本数据迁移**：正式化 `dataVersion`（存 config）+ 启动时按版本有序迁移；**迁移前把 userData 关键文件备份到 `userData/backup/<旧版本>/`**（廉价保险，迁移写坏也能捞回）。
5. **安全**：自更新只认 `origin` 指向的官方仓库；pull 前校验 remote URL；build 在她机器本地跑（无远程代码执行风险，符合可审计红线）。

**风险/边界**：① git/网络/`npm install` 可能失败且耗时→必须进度+优雅失败+回滚兜底。② 升级后第一次启动要先跑数据迁移再开窗。③ 守红线：不引入额外后端，全本地 git+npm，可审计。

**文件改动（预估，待实现）**：新 `src/main/updater.ts`(git fetch/compare/pull/build/rollback，execFile 跑 git/npm 防注入) + `dataVersion` 迁移框架(可新 `src/main/migrate.ts`) + 设置面板「检查更新」入口 + 头顶气泡更新提示 + README 安装改 clone-only。验收=造一个落后 commit→检查到新版→点更新→拉取重建重启进新版+记录全在；故意 build 失败→自动回滚旧版+记录全在。

### 待办队列（新会话按此推进，2026-06-15）
0. ~~**[待用户操作]** Google Places 位置推荐~~ ❌ **已撤除(用户 2026-06-15 拍板不搞了)**：find_nearby 工具 + Maps 密钥(config/UI/preload/env)整套干净移除，placesTool.ts/test 删除；「不知道吃什么/做饭」建议保留(无需 key，小狗结合口味聊+web_search 查菜谱/本地推荐)。详见 §「待议·Google Maps」已划掉。
A. **[基础设施/打磨 · 用户选定可自排做]** ① ~~MCP 接入(Phase 4)~~ ⏸️ **暂缓·标 backlog(用户 2026-06-15 拍板「先不做」)**：YAGNI——目前没有具体想接的 MCP server，伴侣(电脑小白)也不会自己配 server，没有预配好的 server 就用不上。将来真有要接的 server(如 Notion/音乐/某数据源)再做；做时务必把外部 server 的写/执行工具接进现有「危险确认+沙箱」护栏。 ② ~~小优化三连~~ ✅ **已完成(2026-06-15)**:`set_briefing`(改早/晚简报时间·开关)+画像注入预算(profileUtil `INJECT_MAX_FACTS=24`+`selectInjectableFacts` 纯函数,超额按 constant>明说>高置信>近期取 topN,constant 永留,renderProfile 加 max 参)+抽取 debounce(8s 停顿后抽一次省 key,before-quit flush 补抽)。+12 测,223 离线全过+build+提交。 ③ 收尾:✅ README 功能补全 + ✅ 登录项自启动已实现；仍待真机=README 截图 / 伴侣国外实测 api.minimax 可达。
A2. ~~**[自更新·热升级]**~~ ✅ **已实现(2026-06-15,用户「全都修好」)**：纯函数 `updateUtil.ts`(parseSha/parseBehindCount/parseBranch/isUpdateAvailable/needsNpmInstall/isWorkingTreeClean/describeUpdate/friendlyUpdateError)+ IO `updater.ts`(checkForUpdate 只读 fetch+比对;applyUpdate=记旧SHA→校验工作区干净→`git pull --ff-only`→按需 npm install→build,失败 `git reset --hard` 回滚旧版重建)+迁移框架 `migrate.ts`(`dataVersion`+`pendingMigrations` 纯函数+runDataMigrations 迁移前备份 userData 到 backup/pre-v*)+config.dataVersion/autoCheckUpdate+IPC update:check/apply(成功 app.relaunch+exit)+启动迁移&12s 后自动检查提示+设置面板「检查更新」按钮/进度/自动检查开关+README clone-only+更新FAQ。+25 测(updateUtil19+migrate6),245 离线全过+build+E2E16。**git 命令只读冒烟实跑通过**(show-toplevel/branch/fetch/rev-list/porcelain 都对,脏工作区守卫验证生效)。**剩真机验收**:造一个落后 commit→检查→更新→重启进新版+记录在(同登录周期属真机项)。

B. **[Path B 旧·Phase 0 重构]** 已完成(见上方已完成大块)，下面 §「能力引擎升级方案」里的 Phase 标记为历史记录。
1. **[真机集中验收]** 大量新功能未集中真机走查：计划番茄钟自动开/agent多轮循环/读取工具(查待办·天气)/图片vision/Apple UI/番茄统计跨天刷新+周统计/**多会话(左侧栏建切改删)+全局画像+总结式标题+主动消息只走气泡不进对话框**。按"一天剧情"清单走一遍。
2. **[会话管理·✅ 已实现+自动化验收 2026-06-14]** 多会话 + 全局共享画像 + 靠谱护栏**全部落地并自动测过**。
   - 实现:第一步骨架(sessionsUtil/sessions.ts/左侧栏 UI/迁移)+ 第二步护栏(低置信不注入/保守抽取/口头纠正高置信/面板手改=权威 constant/顺口确认)+ D1 修复(回复流式中禁切/建/删会话,blockedWhileStreaming 拦截+提示)。
   - **自动化验收(我先跑)**:typecheck ✓ · vitest 162 过(纯函数 sessionsUtil16+scenario6+profileUtil11 · **fs 集成 10**=mock electron 真读写 sessions.json 持久化/重启/隔离/迁移/删空补建 · 其余)✓ · **Playwright-Electron E2E 13 过**(真启 App 真点侧栏:建/切/改名/删/两步确认/删空补建/窗口720/设置番茄面板互斥 D3)✓ · build ✓。`npm run test:e2e` 可复跑(隔离 userData 不碰真实数据)。
   - **剩人工走查(仅 LLM 行为,自动测不到)**:① C 组靠谱护栏观感(说关键事实→顺口确认/纠正→覆盖/闲聊不记)② 普通发消息流式回复+图片vision③ 主动消息(提醒/简报)落当前会话观感。代码层已绿,人工是确认手感。
   详见 §「多会话 + 全局画像 架构方案」。
3. **[画像 UX 打磨 · 仍待做]** 让"可编辑"更明显(如 hover 出编辑态/铅笔图标/分类可改)；保留两步确认清空。
3.5. **[思考流不显示 · 已查清并收尾(用户 2026-06-16 报)]** "💭 思考中…"面板只显示占位、不显示流式思考内容。**根因实测定论**:接线全完整(`chat.ts` onThinking→`index.ts` `chat:thinking`→renderer `appendThinking`→`.think-detail`)，**缺的是模型不产思考流**。
    - **已做**:① `chat.ts` 按模型能力开 reasoning——`supportsReasoning = model.reasoning===true` 才向 `pi.stream` 传 `reasoning:'low'`(REASONING_LEVEL),非 reasoning 模型不传(省开销);openai 兼容自建 Model 仍 `reasoning:false` 故不受影响。② 新增 gated 诊断测 `test/thinking.diag.test.ts`(SCENARIO_LIVE)。
    - **实测结论(MiniMax-M3 / minimax-cn / anthropic-messages 端点)**:开 reasoning 后 `thinking_delta` 字符数 **low=0、high=0**(直连 pi.stream 复测,events 仅 text_*,无 thinking_start/delta)。即 **MiniMax 的 /anthropic 兼容端点接受 reasoning 参数但不回思考内容**,属 provider 限制,客户端无法修。pi-ai 对该模型走 budget-based thinking(`thinking:{type:enabled,budget_tokens,display:summarized}`),minimax 实质忽略(回包正常短答,无内部思考膨胀迹象,故无额外成本)。
    - **UX 已优雅**:renderer 早已处理"无思考流"——首个答案 delta 到达且 `thinkRaw` 空→撤占位(`chat.ts:357`),`finishStreamPanel` 同理(无思考则 remove)。故 MiniMax-M3 表现=「💭思考中…」短暂作 loading 指示→答案流出→占位消失,**不留空思考框误导**。无需再改 UI。
    - **结论**:修复是正确的通用行为(换到真回思考流的模型如 Claude 即自动点亮面板);MiniMax-M3 看不到思考是其端点不回,非 bug。本项收尾。
3.6. **[流式打字感 + emoji 表达 · ✅ 已完成(用户 2026-06-16 报)]** 用户反馈"没看到像 DeepSeek 客户端那样的流式输出"+"可以用 emoji",且截图见正文裸露 `[爱你]` 标签。
    - **流式打字机**:根因=MiniMax 经 anthropic 端点发大块 delta(实测 59 字仅 3 个 delta)→答案"跳几下"而非逐字。renderer `chat.ts` 加 rAF 打字机平滑层:`activeRaw` 累计原文、`displayedLen` 以稳定节奏(每帧 max(2, 剩余/8) 字,积压多则加速)追向目标,只渲染目标前缀;`leadingTagPending` 防开头 `[情绪]` 标签传输中一闪;onDone/onError/send/abort 均 stopTypewriter+夹紧。呈现像 DeepSeek 逐字打字,不受网络分块影响。
    - **emoji**:① `emotion.ts` EMOTION_INSTRUCTION 增"欢迎自然用 emoji";② 新增 `decorateEmotionTags`——把正文残留的已知情绪标签(模型违规写句中的 `[爱你]` 等)转 emoji(💗😊🎉…),负向预查 `(` 不吃 Markdown 链接;③ 主进程 onDone/pushProactive 存与发都 decorate、renderer 流式途中+onProactive+renderHistory(retroactive 修旧记录)都 decorate。+4 单测。
    - 验证:typecheck + 254 离线测 + build 全绿。思考过程对 MiniMax-M3 仍不可得(见 3.5,模型端点不回,非本程可修)。
4. ~~**[抽取节奏优化]**~~ ✅ 已完成 2026-06-15：抽取 debounce（8s 停顿后抽一次省 key + before-quit flush 补抽）。
5. **[收尾]** ✅ README 功能介绍补全 + ✅ `set_briefing` 已实现 + ✅ 登录项自启动已实现；**仍待真机**：README 截图 / 伴侣国外实测 api.minimaxi.com 可达 / 对方视角从0安装演练。

### 已完成大块（勿重复做）
对话转待办+核销/晨晚简报/持久化补发/行程前置/倒数日/天气(IP自动定位+手填)/解锁问候/久坐/主动找话题pulse/情绪标签gif桶/番茄钟(即时+计划+对话启停+头顶倒计时+跨天统计周统计)/桌面头顶气泡/结构化画像(抽取+注入+可编辑面板)/记忆模型下拉/配置即对话(set_location·set_supervision·set_daily_reminder·schedule_focus等对话工具,无感行动)/agent多轮工具循环+读取工具/图片vision+模型能力管理/Apple HIG 聊天窗(主页干净·番茄钟⚙各子页·可拖拽放大500x740)/多会话(左侧栏·历史&摘要按会话隔离·画像全局共享·旧单流无损迁移)+记忆靠谱护栏(低置信不注入·保守抽取·口头纠正/面板手改=权威·顺口确认)。

## 记忆升级方案（用户 2026-06-13 拍板 — 当前主线）

**动机**：现状是「24 条阈值 + LLM 重写单段摘要」(memory.json `{summary, summarizedUpTo}`)，
属"懒人记笔记"——有损漂移、越压越糊、前期信息不沉淀、无结构、不可纠错。要升级成
Clarvis 式「离散事实档案」：一条条带类型、可单独更新/纠错、不漂移。

**三项已定决策**：
- **抽取时机** = 每轮对话后**增量抽取 + 信号门控**（闲聊无新信息→模型返回空→不写，省 key；
  只有出现新事实/情绪/约定才落库；用便宜的非流式短调用）。保留现有滚动摘要做"叙事背景"，
  新增结构化画像做"精确档案"，两者并存注入人设。
- **可见性** = 设置面板加「小狗眼中的你」区块，**可看可编辑**（逐条改/删 + 清空画像）→ 透明可控、可纠错。
- **范围** = **明确事实 + 克制的推断标签**：身份/喜好/在意的事/约定（明确）+ 性格/情绪/作息倾向
  （推断，标 `inferred`，可被新信息覆盖）。

**数据结构**（新文件 `profile.json`，与 memory.json 并存；清空对话时一并清）：
```ts
type FactCategory = 'identity' | 'preference' | 'concern' | 'commitment' | 'trait'
//                   身份        喜好          在意的事     约定          推断标签(inferred)
type FactType = 'world' | 'experience' | 'opinion'  // 世界事实/经历/观点 → 决定可变性(偷 Clarvis)
interface ProfileFact {
  id; category; content; inferred: boolean
  factType: FactType; confidence: number   // 偷 Clarvis：观点可被覆盖、低置信不主动用/面板可排序
  supersedes?: string                       // 偷 mem0 old_memory：旧值,给面板撤销+审计
  constant?: boolean                        // 偷 SillyTavern：是否总注入(否则按相关度/最近度)
  createdAt; updatedAt
}
interface UserProfile { facts: ProfileFact[]; updatedAt }   // facts 设上限(~60)+注入预算,超额按优先级淘汰
```

**抽取流程**（`chat.ts` 加 `extractProfile()`，非流式结构化）：
每轮 assistant `onDone` 后 → 把「本轮 user+assistant 对话 + 现有 facts」喂模型 →
模型输出操作列表 `[{op:'add'|'update', category, content, inferred, targetId?}]`；
空数组=无新信息→跳过不写（信号门控）。合并由纯函数 `applyProfileOps()` 做（add/update-by-id、
按 category 防重复、超上限淘汰最旧），写回 profile.json。

**注入**：systemPrompt = 人设 + 【长期记忆摘要】 + 【你对用户的了解】(facts 按 category 分组渲染)；
画像超量时优先注入最近更新的若干条。

**UI**：设置面板「小狗眼中的你」——按分类列出 facts，逐条可编辑/删除 + 「清空画像」。
IPC：`profile:get` / `profile:update`(单条) / `profile:delete` / `profile:clear`。

**文件改动**：
- 新 `src/main/profileUtil.ts`（纯函数：applyProfileOps / renderProfile / 上限淘汰）→ 可单测
- 新 `src/main/profile.ts`（fs：load/save/clear profile.json）
- `src/main/chat.ts`：加 `extractProfile()`（信号门控、结构化输出）
- `src/main/index.ts`：onDone 触发 `maybeExtractProfile`；注入画像；profile:* IPC；清对话时清画像
- `src/preload/index.ts`：暴露 profile API
- renderer 设置面板 + css：「小狗眼中的你」区块
- `test/profileUtil.test.ts`：applyProfileOps / renderProfile 纯函数单测（≥6 测）

**验收**：typecheck + build + 全部 vitest 过；dev 实跑——说一条明确事实(如"我对花生过敏")下一轮
能在画像看到；闲聊不产生新 fact；面板可改/删/清；清空对话后画像清空。

**抽取模型（成本结论 2026-06-13）**：每轮抽取 ≈ 输入 ~1.5k + 输出 ~0.05k token，输入主导。
重度使用(100 轮/天)月成本：Flash/便宜档 ≈ ¥5–10、中端 reasoning ≈ ¥30–40。结论=成本非问题，
但**别用她默认的 MiniMax-M3(reasoning,慢贵)做抽取**。落地：设置加可选「记忆模型」下拉，默认
便宜档(GLM-Flash/MiniMax 文本档)；留空则复用主模型(省心兜底)。

**调研补强（2026-06-13，扒 mem0/LangMem/Letta/Clarvis/SillyTavern 源码）**：
- ✅ **方向被验证**：mem0(30k★)/LangMem/Letta 全是"typed facts + ADD/UPDATE/DELETE/NOOP + LLM 决定 op"；
  桌宠/waifu 圈大多只做 chatlog 向量 RAG、效果平庸(Open-LLM-VTuber 甚至删了长期记忆)。**确认不上向量库**
  (SillyTavern 关键词+最近度注入足矣)。
- 🔴 **矛盾→UPDATE 覆盖,绝不 DELETE**（避 mem0 #1 bug：'爱中餐'→'恨中餐' 被删空）；DELETE 只给明确"别记这个"。
- 🔧 **改"每轮硬抽"→"停顿/空闲时抽"**：LangMem debounce(连发多条等停顿一次抽) + Letta sleep-time(挂到小狗
  待机空闲跑,复用现有待机轮换循环)，省 key 且不卡回复。与信号门控叠加。
- 🔧 **persona/摘要设为抽取只读 block + 字符上限**(偷 Letta)：防每轮抽取污染人设/摘要。
- 字段已加：factType/confidence/supersedes/constant（见上 schema）。

**靠谱护栏（用户 2026-06-14 拍板：「靠谱远比体感重要，仔细权衡」）**——全局共享画像让错误会"全局传染"
(任何会话抽错→污染所有会话+到处自信地用)，故共享层写入门槛必须**显著高于单流时代**，宁可少记慢记、不要记错坑人：
- 🛡️ **抽取保守**：只从**明确陈述**抽事实；闲聊/玩笑/假设/反问语气不抽。门槛宁高勿低。
- 🛡️ **inferred 降级为护栏**：推断的性格/作息**不当确定事实用**——注入时标"可能"，低 confidence 不主动注入、不驱动行为。
- 🛡️ **关键事实顺口确认**：会进画像、影响后续行为的**关键事实**，小狗在对话里**顺口带一句确认**
  (如"记下啦，你下周搬上海~")，给用户快速纠正的机会；闲聊不确认、不弹窗，几乎不破坏体感。
- 🛡️ **用户纠正 = 高置信权威信号**：用户口头纠正 / 面板手改的事实 → 标**高 confidence + 非 inferred + 可置 constant(总注入)**，
  留 supersedes 旧值可审计/撤销；且"用户主动纠正过"本身=该事对用户**重要**，淘汰时优先保留(constant 不淘汰)。
- 🛡️ **矛盾 UPDATE 覆盖、绝不 DELETE**(已定，避 mem0 #1 bug)；DELETE 仅限明确"别记这个"。
- 🛡️ **隔离兜底**：会话内的临时上下文**绝不跨会话**(靠隔离层)，只有沉淀进画像的高门槛事实才全局。
→ 实现时这些是抽取/合并(applyProfileOps)的**硬约束**，写进单测。

## 多会话 + 全局画像 架构方案（用户 2026-06-14 拍板 — 待实现）

**动机**：用户希望像 Gemini 那样分会话聊不同事(话题不串、减少幻觉)，但小狗体感上要"一只越来越懂她的狗"。
解法=**记忆分两种、共享层与隔离层拆开**：懂你的"事实"全局共享，聊天的"话头"按会话隔离。

**架构（核心三条）**：
- 🌍 **画像 `profile.json` = 全局唯一**：不分会话。所有会话每轮 onDone 都 extractProfile→沉淀到同一份；
  所有会话注入同一份。→ 在任何会话说的事实都让小狗更懂"同一个你"。
- 🔒 **可见历史 + 滚动摘要 = 按会话隔离**：每个会话各一份 history + 各一份滚动摘要(会话内压缩防降智，
  互不污染)。这就是 Gemini 式"线程不串味"的来源。
- 🧭 **活跃会话指针**：主动提醒/简报/找话题/解锁问候等非会话消息 → 投递到**当前活跃会话**。

**数据结构改动**（把"单 history.json + 单 memory.json"升成"多会话"）：
```ts
// 新 sessions 索引 sessions.json
interface SessionMeta { id; title; createdAt; updatedAt; lastMessageAt }
interface SessionsIndex { sessions: SessionMeta[]; activeId: string }
// 每会话独立存储：history/<id>.json(消息) + summary/<id>.json(该会话滚动摘要,即旧 memory.json 结构)
// profile.json 不变、保持全局单份
```
迁移：首启把现有 `history.json` + `memory.json` 包成一个默认会话("我们的对话"/原始流)，profile.json 原样保留。

**注入**（每会话）：systemPrompt = 人设 + 【该会话滚动摘要】(隔离) + 【你对用户的了解】(全局画像) + 当前时间。
→ 注入函数从"读全局 memory"改成"读 activeSession 的 summary + 全局 profile"。

**IPC / 形态**：
- `session:list` / `session:create` / `session:switch`(设 activeId) / `session:rename` / `session:delete`。
- 删某会话 = 只删该 history+summary；**画像/长期记忆单独的「清空对你的了解」按钮**(明显分开，防误删记忆)。
- UI：聊天窗加会话列表(侧栏或顶栏下拉)，切换即换 history 渲染；Apple HIG 风格延续。

**文件改动（预估）**：
- 新 `src/main/sessions.ts`(fs：sessions.json 增删改查 + 按 id 读写 history/summary + 迁移旧单流)
- 新 `src/main/sessionsUtil.ts`(纯函数：createSession/renameSession/removeSession/迁移/activeId 选择 + 单测 ≥6)
- `src/main/index.ts`：history/summary 读写改为按 activeId；onDone 抽取仍写全局 profile；主动消息投活跃会话；session:* IPC
- `src/main/chat.ts`：注入改"会话摘要(隔离)+全局画像"；摘要压缩按会话做
- `src/preload`+`env.d.ts`：暴露 session API
- renderer：会话列表 UI + 切换 + 重命名/删除 + 「清空对你的了解」独立按钮；css
- 测试：sessionsUtil 纯函数单测；迁移单测

**验收**：建两个会话分别聊不同话题→上下文不串；在会话A说一条事实→切到会话B小狗也知道(全局画像生效)；
删会话A不影响画像；「清空对你的了解」只清画像不动会话。typecheck+build+全测过。

**形态已定(用户 2026-06-14)**：会话列表放**左侧栏**(非顶栏下拉)，窗口相应**加大**(现 500×740→更宽容纳侧栏)。滚动摘要按会话隔离=确认。

**体量评估(2026-06-14 摸码后)**：中等、可控，非可怕重写——①存储已集中在 history.ts(43行)/memory.ts(43行)两个干净小文件，改"按会话 id"只是缓存 Map 化+函数加 sessionId 参；②**chat.ts(最复杂的 agent 多轮循环)已解耦**——history 当参数接收、摘要由 index 注入，几乎不用动；③调用点集中在 index.ts 约10处、改法一致(穿 activeId)；④**「清画像」按钮 btn-clear-profile 已独立存在**(renderer:46)，护栏"清记忆与删会话分开"天然满足，只需拆清 chat:clear 语义。新增大头=sessions.ts/sessionsUtil.ts+迁移、renderer 左侧栏 UI(纯前端低风险)。
**实现顺序=先骨架后护栏**(两步耦合≈0，可各自独立验收)：
- **第一步·多会话骨架**(只动存储分片+UI，不碰抽取/画像)：sessionsUtil.ts 纯函数+单测 → sessions.ts(索引+按 id 存 history/summary+首启迁移旧单流为默认会话) → history.ts/memory.ts 缓存 Map 化+sessionId 参 → index.ts 穿 activeId(~10处)+主动消息投活跃会话+session:* IPC → preload session API → renderer 左侧栏(新建/切换/重命名/删除)+窗口加宽+切换重渲染 history+拆清「清空对话(当前会话)」与「清画像」语义。验收=建两会话聊不同话题不串、切换正常、旧数据无损迁移。
- **第二步·靠谱护栏**(只动抽取/合并)：applyProfileOps 加六条硬约束+顺口确认+用户纠正高置信+单测。

## 原生集成 + 主动 Agent 能力方案（用户 2026-06-13 拍板 — 主线二，与记忆升级并行排期）

**目标**：从"会聊天的桌宠"→"真正管事、主动提醒、不用天天问"的陪伴 agent。对方是 Mac，定制方便。

**已定决策（2026-06-13）**：
- 接：**提醒事项 读+写** + **日历 读取** + **天气**。
- **不依赖 iPhone/iCloud 同步**：主动提醒主通道 = **小狗自身 macOS 通知 + 弹窗**；写进原生「提醒
  事项」只为给她一个可信、可核销的**本机清单**（iCloud 若开着会自动同步到手机，是免费 bonus，不依赖）。
- 时间关怀**只用本机本地时间**，不做两地时差计算。
- 先做的主动能力：**对话转待办 / 晨·晚简报 / 行程·ddl 前置提醒**。

**技术路径**：Electron 主进程 `osascript` 跑 AppleScript 操控 提醒事项/日历（纯命令行、零新依赖、
可审计，贴红线）；走 pi-agent-core 工具调用给模型注册**安全工具** `create_reminder`/`list_reminders`/
`list_today_events`（Plan 既定"仅安全工具"，绝不引 file/bash）。天气走轻量公开天气 API（联网只读、
免费档/无密钥）。主动节奏复用现有 30s 调度器 + Electron `powerMonitor`(解锁/唤醒) + 系统 idle 时间。

**TCC 权限（用户 2026-06-13 拍板：让她点允许即可，别想重）**：首次访问 提醒/日历弹一次授权框，
**点「允许」就完事**。教程放一张截图标"看到这个点允许"即可。被拒时优雅降级回小狗自管提醒、不崩
（兜底而非主路径）。

**调研补强（2026-06-13，扒 Leon/Khoj/Letta/Open-Interpreter + osascript 实操）**：
- 🔴 **安全红线（偷 Open Interpreter 教训）**：**绝不让模型吐任意 osascript 执行**（=RCE 漏洞）。
  只给**白名单结构化工具** `create_reminder`/`list_reminders`/`list_today_events`，AppleScript 模板
  我们写死、模型只填参数；`execFile("osascript",["-e",script])` 数组传参防注入 + 转义引号 + 处理 TCC 错误码 -1728。
- 🔴 **正确性硬点**：桌面 app 常关着、内存定时器关了即丢 → **提醒规则必须持久化,启动时比对"应响时间 vs 现在"
  补发漏掉的提醒**(否则她关机一晚,早上提醒静默丢失)。现有 30s 调度器需加这个 catch-up。
- 🔧 **bounded 主动节奏 + 静默模式开关**(偷 Leon pulse / AI-Desktop-Pet)：限制多久才主动说一次、禁分钟级
  高频提醒(偷 Khoj 反刷屏)；全局一键静音(送人必备)。
- 🔧 **人话回执**(偷 Khoj)：建完提醒回"好,每个工作日早9点提醒你交作业"。
- Leon(MIT·TS·17k★) 是最对口参考：文件式 pulse 状态(PULSE.md+小 JSON)、无 DB、可直接借。

**🔒 开发期测试安全约束（用户 2026-06-13 明令）**：在用户本机调试**只跑通、只读，绝不修改其真实
提醒/日历数据**。落地：①纯函数单测(日期解析+脚本拼装)零碰系统；②只读探针(读列表名,零写入)验通道+TCC；
③写入路径代码实现但**默认不执行真实写入**,要演示只写一眼可辨废弃列表(如「小狗测试_可删」)且当场删除,
并须用户逐次确认才跑。绝不碰用户既有日程。

**🚀 薄片 v0：对话转待办（最先做 — 用户 2026-06-13 选定）**
目标=最快让小狗"真的动手"。最小闭环：
1. 给模型注册**一个安全工具** `create_reminder(title, dueISO?)`（pi-ai/pi-agent-core 工具调用；
   若 pi-ai 工具调用接法不顺，退而用结构化输出解析）。
2. 模型识别"提醒我下周二交 essay" → 调用工具 → 主进程 `osascript` 写进 macOS 提醒事项
   （`execFile("osascript",["-e",script])` 数组传参；带 due/remind date → **OS 原生到点自动弹**，
   时间型提醒的"主动触发"先白嫖系统，不必等我们的调度器）。
3. **人话回执**进聊天："好，下周二早 9 点提醒你交 essay 🐶"。
4. TCC 首次弹授权→点允许；被拒则回一句"我还没拿到提醒事项权限呢"，不崩。
- **验收**：对她说一句自然语言 → 提醒事项 App 里出现该条 → 到点 macOS 自动通知；无权限时优雅提示。
- 暂不做：相对日期复杂解析(先支持"明天/下周X/具体日期"够用)、读取/核销(留闭环阶段)。

**第一层其余（薄片之后）**：
- 提醒事项 读+列出 + 完成核销（支撑闭环跟进）
- 晨/晚简报（复用 30s 调度器）：早播今日日历+待办；睡前问完成没
- 行程/ddl 前置提醒（读日历 + 读记忆画像里的 ddl）
- 闭环跟进：记得提醒过 → 回来问做了没 → 没做再轻推（支柱③）

**第二层（拓展 backlog — 都本机本地、贴红线、逐步做）**：
- 天气：出门带伞 / 温差提醒
- 开机/解锁问候 + 晨间简报联动（`powerMonitor` unlock/resume）
- 空闲/久坐感知（系统 idle 时间）："学这么久起来走走" / "回来啦！"
- 倒数日 & 纪念日：考试 / 回国的日子 / 重要日子倒计时（情感价值高，本地+记忆画像）
- 番茄钟陪学 + 打卡 streak（监督+陪伴游戏化，本地存）
- 主动找话题：长时间没互动 → 小狗先开口（偷 Leon bounded pulse）
- 本机时间关怀：久坐/喝水/护眼/该睡了（本地时钟）
- 情绪命中增强（偷 amica `[emotion]` 行内标签 + Open-LLM-VTuber"只从实际有的 gif 桶里选"）：
  模型回复带情绪标签 → 直接命中对应 gif 桶，比现按关键词猜更准；可选 Live2DPet"情绪累积"防表情乱跳。

## 配置即对话（用户 2026-06-13 拍板 — 重要理念）
**设置面板只留「首次设置」（模型源/模型/记忆模型/API Key）**，因为没填 key 没法聊天。
其余一切「该由 agent 与用户交互决定」的配置**全部移出表单、改由对话驱动**（电脑小白不该填表单）：
- 天气位置 → 默认 IP 自动；说「我在马德里」→ `set_location` 工具设定。
- 定时提醒（学习/早睡等每日 nudge）→ 说「每天9点提醒我学习」`set_daily_reminder`、「别在23:30喊我」`cancel_daily_reminder`。
- 主动监督总开关 → 说「别管我了/静音」「继续监督我」`set_supervision`（不再放设置里）。
保留在设置/抽屉里的非配置项：「小狗眼中的你」(记忆透明可编辑)、番茄钟、清空对话/画像(两步确认)。
落地：新增上述对话工具(纯函数 reminderRules + handleToolCalls 分支)，渲染层移除 监督开关/天气城市/提醒编辑器。

### 三阶段路线图（用户 2026-06-13：「你来规划顺序全部做完测试好…再端给我人工核查」）
按风险低→高、各自可独立验证排序，全部做完自测后交人工核查：
- [x] **阶段1 计划式番茄钟/学习计划**：focusPlanUtil 纯函数(isPlanDue 星期几+每天/planDayFireKey/normalizeDays/describePlan)+6测；config.focusPlans；startFocusPlanWatcher(30s查到点自动startFocus+通知,firedStore按天去重不补发,专注中不重开)；schedule_focus/cancel_focus_plan 对话工具。
- [x] **阶段2 Agent 多轮工具循环 + 读取型工具**：runChat 重写为多轮(MAX_TOOL_ROUNDS=5,回放done的AssistantMessage+toolResult消息,结果回喂模型二次组织语言)；写入型结果改事实文案由模型措辞；读取型 list_reminders/get_weather。**实机验通**(MiniMax round1调get_weather→round2答'建议带伞')。
- [x] **阶段3 图片输入(vision)+模型能力管理**：能力读 pi-ai model.input(MiniMax-M3/Kimi支持/DeepSeek·GLM不支持)，openai兼容源 vision 标记(Gemini反代=true)；runChat 把图附到当前user消息多模态content；chat:model-vision 据此显隐附图按钮；渲染层附图(选/粘贴/拖拽)+缩略图+移除(上限4)。**实机验通**(MiniMax识别红色)。

### Agent 能力地图（用户 2026-06-13：「不该只有这么点工具，理论上尽可能无感」）
**无感 = 不靠命令/表单，靠自然对话推断并行动**。人设里加「主动行动」指令：用户随口提到
ddl/计划/位置/想被提醒/想清静，小狗就主动调用对应工具并温柔回执，不用她说「帮我记一下」。
- **写入型工具（确定性回执，单轮即可，本轮做）**：create_reminder/complete_reminder/add_countdown(已有)
  + set_location/set_supervision/set_daily_reminder/cancel_daily_reminder(本轮新增)。
- **读取/查询型工具（需 agent 多轮循环：工具结果喂回模型二次组织语言，下一轮做）**：
  list_reminders(「我今天有啥待办」)、get_weather(随时问天气)、start_focus(「陪我专注25分钟」启番茄钟)。
  当前 runChat 是「执行完拼确定性回执、不二次调模型」的单轮结构 → 下一轮升级成 agent loop 再上读取型。

## 产品用意（核心 — 用户 2026-06-12 补充）
交付对象是**在国外留学的伴侣**，本质是一只「数字陪伴者」。要实现四大功能：
- 🫂 **陪伴**：常驻桌面 + 情绪表情，时差/异国里的"在场感"，缓解孤独。
- ✅ **监督**：学习/生活督促——提醒、打卡、关心型 nudge，帮她保持节奏。
- 💬 **聊天**：类 Gemini 流式对话 + 对话记忆，越聊越懂她。
- 💡 **解惑**：学业/生活/情绪 答疑解惑，随手点开就能问。
人设默认 = "留学伴侣的陪伴小狗"（知道她在国外、会主动关心；可在设置里改）。

## 已定稿架构决策（用户已确认 2026-06-12）

**形态**：一只线条小狗常驻桌面（透明、置顶、可拖动的小窗口）；点小狗 → 弹出聊天
面板（类 Gemini 交互）。小狗有「待机 / 思考中 / 回复中」三种**情绪表情**切换
（灵感取自 Clarvis 的 mood-face，用扁平线条风格自绘）。

**技术底座**：✅ **Electron + Vite + TypeScript 单栈**，**从源码 `npm start` 运行**（不打包
.app）→ 绕开 Gatekeeper「无法验证开发者」拦截，零签名成本。参考 Clarvis 的「情绪脸 +
聊天通道」理念，**不 fork**（其 Anthropic-only + Python/uv/Node/Swift 三栈与红线冲突）。

**形象来源**：✅ **用现成的线条小狗素材**（用户偏好真·线条小狗观感，个人非商用）。
线条小狗是 moonlab_studio 的版权 IP，**无开源/CC0 授权**；网上免费合集（爱给网
aigei.com、简书网盘、Sigstick 等）仅个人非商用可用。落地：
- **默认**：从免费无水印 GIF/PNG 合集挑选，映射「待机/思考/回复」三态。
- **保留**：用户可上传自己的图片自定义（存本地 userData，不进 git）。
- **兜底**：自绘扁平线条小狗作为可替换的 fallback。
- ⚠️ **版权风控**：因打包第三方版权素材 → **仓库设为 private**（个人赠予，不公开
  再分发）；素材仅 personal use。

**模型层（重评估后改用 Pi）**：采用 **`@earendil-works/pi-ai`（MIT，TS/Node）** 作为统一
模型层，**不再手写** OpenAI 兼容客户端。理由：原生支持 DeepSeek/MiniMax/智谱GLM(ZAI)/Kimi，
通义与 Gemini反代 走「Any OpenAI-compatible API」自定义 baseURL；白送 流式 + 工具调用 +
成本统计 + 上下文序列化/持久化。六源全覆盖，配置 = `baseURL + apiKey + model`，默认留空让
用户选，存本地 userData。**首发默认源 = MiniMax（用户指定 2026-06-12）**。

**MiniMax 接入实测（pi-ai 探测）**：
- provider `minimax`（国际站 `https://api.minimax.io`）/ `minimax-cn`（国内）。伴侣在国外 →
  用国际站 `minimax`。
- 模型：`MiniMax-M2.7` / `MiniMax-M2.7-highspeed` / `MiniMax-M3`（均 reasoning）。
  **默认 = MiniMax-M3（用户选定 2026-06-12）**，设置里可切换。
- ⚠️ **协议 ≠ 厂商**：这些模型的 `api` 是 `anthropic-messages`，即走 MiniMax 自家的
  Anthropic 兼容端点 `api.minimax.io/anthropic`，底层会用到 `@anthropic-ai/sdk` 库，但
  **数据只发 MiniMax、用 MiniMax 自家模型，绝不触达 Anthropic/Claude** → 红线实质守住。
- key：调用时以 `{ apiKey }` 传入（存主进程 userData，不进渲染层 / 不进 git）；env 名
  约定 `MINIMAX_API_KEY`。GroupId 是否需要 → 拿到真 key 时验证。
- ⚠️ **依赖代价**：pi-ai 打包多家 SDK（含 `@anthropic-ai/sdk`/`openai`/`@google/genai`/
  `mistral`/`bedrock`），比手写单文件客户端重 → 触「依赖少可审计」红线，但 MIT 可审计、
  省造轮子，功能优先下接受（用户确认）。
- ⚠️ **红线守法**：上述 SDK 仅作 node_modules 依赖存在；**运行时永远只配国产源/Gemini 反代，
  绝不调 OpenAI/Anthropic provider** → 守住「不连 OpenAI/Anthropic」红线。
- **可选** `@earendil-works/pi-agent-core`：agent 循环 + 工具调用，仅注册安全工具（提醒/查询），
  **绝不引** file/bash 工具与 `pi-coding-agent`/`pi-tui`。

**记忆层（学 Clarvis 但不破单栈）**：Clarvis 记忆=Hindsight+Cognee 但**是 Python**（其三栈重的
根源）→ **不直接搬**。改用 TS 轻量实现：pi-ai 自带 context 序列化/持久化 + 自建滚动摘要式长期
记忆，拿到 Clarvis 级"越聊越懂"效果而不引 Python。

**首版范围**：纯文字聊天 MVP **+ 对话记忆**（本地持久化多轮历史 / 长期记忆，仍纯文字）
**+ 主动监督**（小狗定时主动弹提醒/打卡，如每晚「今天学了吗」+ macOS 系统通知）。
语音(TTS/ASR) 留到后续迭代。

**保姆级安装（核心难点）**：
- `安装.command`（双击）：检测/安装 Homebrew → 安装 Node → `npm install` → 完成。
- `启动小狗.command`（双击）：`npm start` 拉起桌宠。
- 配套图文教程（README + 截图/PDF）：如何拿 API Key、双击哪个文件、首次 macOS
  安全提示怎么点。
- 兜底：把已知坑（Node 没装、网络慢、权限提示、Apple Silicon 架构）写进 Errors.md
  与教程 FAQ。

## TODO
- [ ] **🚀 主线二·主动 Agent（当前主线，见「原生集成 + 主动 Agent 能力方案」）**
  - **薄片 v0 = 对话转待办（最先做）**：
    - [x] `reminders.ts` 纯函数（parseIsoDate/escapeAppleScript/buildCreateReminderScript/buildListNamesScript/formatDueHuman）+ `test/reminders.test.ts` 11 测全过（含脚本逃逸转义测）
    - [x] `remindersOs.ts` osascript 执行层（execFile 数组传参 + TCC -1728/-10004 友好处理）；**只读探针实机验证通过**（读到列表:提醒/Reminders/待办/BOSS直聘,零写入）
    - [x] 工具注册 + 分发：chat.ts 导出 `createReminderTool`(typebox schema) + runChat 收 tools/onToolCalls 处理 toolcall_end；index.ts `todayHint()` 注入今天日期、`handleToolCalls()` 执行写入并拼人话回执(确定性,不二次调模型)
    - [x] 接线：chat:send 传 [createReminderTool] + onToolCalls；config 加 `reminderList`(默认安全列表「小狗测试_可删」+ensureList,不碰真实列表)。typecheck/31测/build 全过
    - [x] 地基冒烟验证（无写入，自测）：MiniMax-M3 经 pi-ai **确实触发 create_reminder 工具调用**，相对日期正确(明天→2026-06-14)，arguments 结构匹配 handleToolCalls；无工具时不误触发。(只读探针已先验证 osascript 通道)
    - [ ] dev 实机验收（待用户，唯一剩项）：说一句"提醒我…"→「小狗测试_可删」列表出现该条→到点 macOS 自动通知；无权限优雅提示。**首次会弹 TCC 授权点允许；验收后可删测试列表**
  - **薄片之后（第一层其余）**：
    - [x] 提醒事项 读+列出 + 完成核销：reminders.ts 加 buildListRemindersScript(只读)/parseReminderTitles/buildCompleteReminderScript + 8测；remindersOs 加 listReminders/completeReminder；chat.ts 加 completeReminderTool + PET_TOOLS；index handleToolCalls 加 complete 分支(✅勾掉回执)。38测/typecheck/build 过
    - [x] 持久化 + 补发漏发（正确性硬点）：scheduleUtil 加 isMissed/dayFireKey/minutesOfDay/reminderMinutes +5测；新 firedStore.ts 持久化今日已触发键(重启不重复/裁剪当天)；scheduler 用 dayFireKey 去重 + 2h 补发窗口
    - [x] 晨/晚简报：config 加 morningBriefing/eveningBriefing(默认 08:30/22:00)；scheduler 把简报作伪提醒走同一去重补发；index composeBriefing 动态读 reminderList 待办合成早安/晚安播报
    - [x] 行程前置提醒（读日历）：新 calendar.ts(buildTodayEventsScript 只读/parseEventLines/eventLeadMinutes/isUpcoming)+7测；calendarOs.ts listTodayEvents；早安简报带今日行程；index startEventWatcher 每5min查、事件前30min主动提醒(按天去重)。只读探针实机通过
    - [~] 闭环跟进：晚间简报已列「这些还没完成」+ 用户说做完→complete_reminder 勾掉，已成基本闭环；**专门的定时追问(提醒过→1h后问做了没→再轻推)留后续**
    - [x] 全局静默开关：已由现有 `supervisionEnabled` 覆盖（关掉即停所有主动提醒+简报，设置面板已有开关）。**bounded 节奏**留到「主动找话题」时再做（YAGNI，现无找话题不造冗余）
  - **第二层 backlog**：
    - [x] 倒数日·纪念日：anniversary.ts 纯函数(daysUntil/nextRecurringDays/anniversaryLine,里程碑30/14/7/3/1天+当天庆祝带年数)+6测；config.anniversaries；add_countdown 工具(对话即可加)；早安简报带倒计时
    - [x] 解锁问候(powerMonitor) + 久坐感知(idle)：presence.ts 纯函数(evaluatePresence 久坐/久别归来状态机+shouldGreet 冷却门控+pickGreeting 时段问候)+6测；index startPresenceWatcher 监听 unlock-screen/resume 问候(30min冷却)+每分钟查 getSystemIdleTime(连续活跃50min→起来走走/每段一次,空闲5min重置,久别15min回来打招呼)。均 gated by supervisionEnabled
    - [x] 主动找话题(bounded pulse,支柱①久未聊→先开口)：pulse.ts 纯函数(shouldPulse 清醒时段9-22+静默≥4h+冷却≥3h+每日≤3+跨天归零;registerInteraction/registerPulse;pickOpenerFallback)+10测；chat.ts composeOpener(非流式以人设口吻开一句,失败兜底);index startPulseWatcher 每5min查(人在场=idle≤5min才开口,避免自言自语)+chat:send registerInteraction 刷新静默+composePersona 抽取复用。gated by supervisionEnabled
    - [x] 情绪标签命中 gif 桶(amica [emotion] 思路)：shared/emotion.ts 纯函数(parseEmotion 只剥开头已知中文情绪标签、不吃 Markdown 链接;emotionToPetState 兴奋→attention/思考→thinking/余→reply;EMOTION_INSTRUCTION 人设指令)+6测；index composePersona 追加指令+onDone parseEmotion 剥标签存干净文本+driveReplyMood 按情绪命中桶+pushProactive 剥标签；renderer 流式途中即时剥(不闪)。**比按文件名关键词猜更准**——模型自报情绪直接命中桶
    - [x] 天气(出门带伞/温差)：weather.ts 纯函数(Open-Meteo 免费无密钥;buildGeocodeUrl 按输入文字选语言 zh/en 避免英文名错配/buildForecastUrl/parseGeocode/parseForecast/weatherCodeText WMO码→中文/isRainy/weatherAdvice 带伞·保暖·防晒·温差最多2条/composeWeatherLine)+19测；weatherNet.ts fetch层(6s超时+坐标内存缓存,失败安静返null);config.weatherCity+设置面板城市输入;早安简报集成天气行。实机验通(New York/北京 geocode+forecast 真实返回正确)
      - [x] (用户 2026-06-13 要)IP 自动定位：城市留空＝按 IP 自动定位(ip-api.com 免费无密钥 lang=zh-CN 出中文地名如「马德里」+经纬度),填城市＝手动覆盖(VPN兜底)。weather.ts buildIpGeoUrl/parseIpGeo+weatherNet resolveGeoByIp(会话缓存);设置文案改「留空＝自动按网络位置」
    - [x] 番茄钟 streak：pomodoro.ts 纯函数(recordCompletion 连续天数:同日累计/昨天+1/断签重置1,best保留;streakLine 庆祝文案+新纪录;跨月正确)+8测；pomodoroStore.ts 持久化(userData/pomodoro.json,重启不丢);index 主进程计时器(关聊天窗不丢)+pomodoro:start/stop/state IPC+到点 recordCompletion+pushProactive 庆祝(通知+蹦跳);preload+env.d.ts pomodoro API/StreakView;设置面板🍅区(分钟输入+开始/停止按钮+本地倒计时显示+连续天数/今日数)+css
    - [x] 本机时间关怀（喝水/护眼/该睡了）：**已被覆盖**——久坐感知(起来走走/喝口水)+晚安简报(该睡了)+解锁问候(时段关怀)已涵盖，不再单造冗余触发（YAGNI）
- [ ] **🧠 主线一·记忆升级（次做，见「记忆升级方案」）**：结构化用户画像 + 离散事实库
  - [x] `profileUtil.ts` 纯函数 + `test/profileUtil.test.ts` 9测（ADD/UPDATE/DELETE/NOOP；矛盾走UPDATE+supersedes；constant永不淘汰；上限60；不可变）
  - [x] `profile.ts`（profile.json 读写/清空，仿 memory.ts）
  - [x] `chat.ts` `extractProfile()`（非流式 + 信号门控 + 容错 JSON ops 解析 parseProfileOps）
  - [x] `index.ts` 接线：onDone 触发 maybeExtractProfile / 注入 renderProfile 到人设 / 清对话清画像 / profile:get·update·delete·clear IPC
  - [x] preload 暴露 profile API（get/update/remove/clear/onChanged）
  - [x] 设置面板「小狗眼中的你」可看可编辑区块 + css：chat.ts 渲染画像(分类标签/推断标记)+逐条改(change→update)/删(×→remove)/清空；env.d.ts+preload 类型；onChanged 实时刷新；非 innerHTML 防 XSS
  - [~] 设置加可选「记忆模型」下拉 —— **用户 2026-06-13 拍板：只留一个 key，别搞复杂**。落地=记忆模型在**主模型的同一个源/同一个 key** 下选一个模型 id 用于后台抽取(summarize/extractProfile)，**留空=跟随主模型**(现状兜底)。不加第二个 key/源(跨厂用便宜档的灵活度放弃，换小白零门槛)。
  - [~] 验证：typecheck/build/57测 全过；停顿/空闲时抽取(debounce)留优化；dev 实跑待集中验收
- [ ] 线条小狗形象：从免费无水印合集(爱给网等)挑选素材，映射待机/思考/回复三态；自绘风格作 fallback（当前是自绘占位）
- [x] 形象自定义：设置面板选图片/GIF→存 userData→data URL 推渲染层<img>(GIF自带动画)；可恢复默认自绘狗。即「现成线条小狗素材」的版权干净落地（用户自备图）
- [x] 聊天面板：类 Gemini 对话 UI（流式输出 + Markdown 渲染 + 外链系统浏览器打开）—— 独立聊天窗
  - [x] 实机修：①设置抽屉内容过长撑爆固定窗口、顶栏/输入栏被挤掉 → `.settings` 加 max-height:320px + 内部滚动；②（用户 2026-06-13 提）点聊天框外任意处即收起，不必再点小狗 → 聊天窗 `blur` 即 hide + 250ms 守护避免点小狗时 blur 隐藏又被 toggle 重开的竞态；文件选择框改 sheet 挂窗口避免误触发隐藏
  - [x] （用户 2026-06-13 提）破坏性操作防误触：「清空对话」「清空画像(小狗眼中的你)」改两步确认(点→变「确认?」3秒内再点才执行,内联确认非原生 confirm 以免触发失焦隐藏)
  - [x] （用户 2026-06-13 提）去掉「改形象」入口：移除设置面板 选形象图/GIF·恢复默认狗·精灵图(选/应用/清除+行列帧) 全部 UI(伴侣用 gif图/ 动图集即可,不该给改形象权限)。主进程 IPC 保留未删(死代码,无害);形象优先级仍 精灵图>单图>动图集>自绘
- [~] 模型层：集成 `@earendil-works/pi-ai`（主进程跑，key 不进渲染层）；MiniMax 已接，余源待补预设
- [x] 对话记忆：本地全量历史持久化 + 滚动摘要式长期记忆(memory.json,超24条把旧的压缩进摘要注入人设,保留最近10条原文;清空对话同时清记忆)
- [x] 主动消息「看得见」——桌面头顶气泡（用户 2026-06-13 提）：pushProactive 除系统通知/写聊天窗外，新增 `pet:say` 推给桌宠窗 → dog.say() 在小狗头顶冒白卡气泡(向下小尾巴/4行截断/textContent防XSS)，8s 自动淡出，点气泡=开聊天(triggerChat 先 hideBubble)。PET_HEIGHT 300→380 留头顶空间(狗底部对齐位置不变)。覆盖全部主动触发(简报/提醒/久坐/解锁/找话题/番茄钟完成)。系统通知保留作后台兜底
- [x] set_briefing 对话工具(简报时间/开关可对话改)—— ✅ 已实现 2026-06-15（复用 normalizeTime 校验，落 morning/eveningBriefing；+briefingTool.test 7 测；todayHint/scenario.live 镜像同步）
- [x] 主动监督：轻量调度器(每30s查) + macOS 系统通知(Notification) + 可配置提醒/打卡(默认学习21:00/早睡23:30) + 触发时小狗蹦跳+主动说话进聊天；设置面板可开关/改时间文案
- [x] 陪伴人设：默认「留学伴侣陪伴小狗」system prompt（已写进 config 默认，设置可改）
- [x] 设置面板：模型源下拉(6源:MiniMax国内/国际·DeepSeek·GLM国内/国际·Kimi国内/国际·通义·Gemini反代) + 模型下拉(随源刷新) + 自定义源的baseURL + key 表单(存主进程,不回传明文)。native走pi provider,通义/Gemini反代走自建OpenAI兼容Model
- 注：当前单 key 字段，切源需重填该源 key（per-provider key 留作后续）
- [ ] 配置与密钥：本地存储、`.env.example`、`.gitignore` 屏蔽密钥（已建 .gitignore）
- [x] 保姆级安装：`安装.command`(检测Node→开官网/装依赖走npmmirror→补Electron运行时) + `启动小狗.command`(校验后 npm start)；可执行+语法校验过。自启动登录项留后续
- [x] 图文教程：README.md（安装三步/拿MiniMax key/玩法/FAQ含401站点坑/Gatekeeper右键打开/隐私）；截图待补
- [x] 单元测试：vitest 覆盖纯逻辑(markdown/providers/scheduleUtil)18 测；安装脚本干净 Mac 演练 + 聊天 E2E 留真机
- [ ] 在自己机器上完整演练「对方视角」：从 0 拉仓库到能聊天

## In Progress / 下一步候选
- [x] 精灵图(sprite sheet)动画支持：sprite.ts(rAF 分帧,行=状态/列=帧,按情绪切行);设置面板可选。**注：用户改用动图集，精灵图保留但非默认。**
- [x] 动图集形象（用户 2026-06-12 改主意，放弃精灵图）：✅ 已实现——petAssets.ts `loadGifPools` 扫 `gif图/`(从源码 cwd 优先，回退 app 路径)，按文件名关键词把 10 个 `小白_<行为>.webp` 全归进 idle/thinking/reply/attention 四桶(打招呼/拍手/爱心/耳朵→reply，左右跳/拉拉队→attention，老师/敲电脑→thinking，走路哼歌/无聊→idle)；index.ts resolveVisual `hasAnyGif`→下发 gifset；优先级 精灵图>单图>**动图集**>自绘狗。**默认启用**，10 个全用上。
- [x] 长期记忆：滚动摘要式（memory.json，超24条压缩旧对话进摘要注入人设）
- [x] 单元测试：vitest，markdown(10)/providers(4)/scheduleUtil(4) 共 18 测全过
- [ ] README 截图 + 伴侣在国外实测一次（确认 api.minimaxi.com 境外可达）—— 待真机
- [x] 登录项自启动：✅ 已实现 2026-06-15（推翻"暂不做"）。从源码运行下 setLoginItemSettings 用 `path=process.execPath + args=[app.getAppPath()]` 指向「electron + 本应用路径」即可登录拉起；设置面板可勾选；启动仅在 autoLaunch=true 才同步(避免 Operation not permitted 噪音)。**剩真机 logout/login 周期验证拉起是否成功**。

## Done
- [x] 调研可二开/参考的开源桌宠项目（Open-LLM-VTuber 等 + 用户指定的 Clarvis）
- [x] 确认四项关键决策：子文件夹 doubleagent/ / 参考 Clarvis / GitHub pull 分发 / 不付费签名
- [x] 建 doubleagent/ 子文件夹 + git init + 起草 Principal/Plan/Errors/AOL + .gitignore
- [x] **定稿四项 Open Question**：Electron 单栈 / 自绘+可上传形象 / MVP+对话记忆 / 六源含 MiniMax 默认留空
- [x] **Electron 单栈骨架**：透明置顶 + 可拖动 + 点击穿透(IPC 切 ignoreMouseEvents) + 三态占位线条小狗；electron-vite 5 + vite 6，typecheck/build/boot 全过
- [x] **聊天 MVP 接线**：pi-ai 主进程流式 + IPC + 独立聊天窗(类 Gemini 气泡/流式/设置抽屉) + 本地历史持久化 + 小狗情绪联动 + 陪伴人设
- [x] **MiniMax 端到端打通**：真 key 实测定位 401=国内站 key 走错国际端点；改 provider→`minimax-cn`(api.minimaxi.com)；流式/非流式均 200，人设回复正常。.env 填 key 通道可用

## Open Questions / Decisions
- ~~架构底座~~ → ✅ 采纳 Electron 单栈 + 从源码运行 + 不 fork Clarvis。
- ~~形象来源~~ → ✅ 自绘扁平线条小狗为默认 + 支持用户上传图片自定义（不商用）。
- ~~首版范围~~ → ✅ 纯文字聊天 MVP + 对话记忆；语音留后续。
- ~~默认模型源~~ → ✅ 六源全做预设（含 MiniMax），默认留空让用户选。
- ~~pi-ai 依赖取舍~~ → ✅ **采用 pi-ai（功能优先）**，接受依赖变重；运行时只配国产源/Gemini反代，绝不调 OpenAI/Anthropic。可按需用 pi-agent-core（仅安全工具）。
- （新）对话记忆的形态：先做「本地会话历史 + 可选系统人设」，长期记忆（向量/摘要）作为后续增强？— 待实现阶段细化
- ~~「监督」首版形态~~ → ✅ **主动定时提醒/打卡 + macOS 系统通知**（首版就做，加轻量调度器）。

## Requirement Change Log
- 2026-06-14: **重大方向升级·能力引擎(Path B)**——用户澄清项目本意=**魔改版 Clarvis/nanobot**:给异地不懂电脑的伴侣
  一个"对标 Claude Code 实干能力、但有人情味、记忆全自动"的桌面助手(能修电脑小毛病/疑难杂症/办事/提效),
  Claude Code 对她不合适(冷+要手动管记忆)。评估三路线后**拍板 Path B**=把 nanobot(~/dev/nanobot)工具层移植进我们 TS
  (registry+filesystem+shell+web+mcp),不引 Python/不套 Claude Code,守 Principal 红线(国产/可审计/单栈/电脑小白)。
  新增硬约束:危险系统操作必须确认+沙箱+保守默认+审计日志。北极星四支柱:能干/人情味/自动记忆(已做)/小白安全。
  路线=Phase0 工具注册表重构→Phase1 能力工具→Phase2 安全层→Phase3 人情味翻译→Phase4 MCP。详见 §「能力引擎升级方案(Path B)」。
  **未改 Principal.md**(用户只授权改 Plan;End Goal 措辞是否更新待用户单独确认)。旧主线一/二(记忆/多会话/主动提醒)均已落地,并入支柱③与既有能力。
- 2026-06-12: 项目立项。AI 桌宠（线条小狗）+ 类 Gemini 聊天，macOS，赠予电脑小白伴侣。
- 2026-06-12: 决策——放 doubleagent/ 子文件夹；参考 https://github.com/shepardxia/Clarvis；
  分发走 GitHub pull + 填 API；不买 Apple 签名（个人项目，从源码运行绕开 Gatekeeper）。
- 2026-06-12: 红线——不接 OpenAI/Anthropic，只接国产模型或 Gemini 反代；密钥仅本地不进 git。
- 2026-06-12: **拍板四项**——(1) Electron 单栈+从源码运行+不 fork Clarvis；(2) 默认自绘线条
  小狗 **+ 用户可上传图片自定义形象**；(3) 首版 = 纯文字 MVP **+ 对话记忆**；(4) 模型预设
  **新增 MiniMax**，连同 DeepSeek/通义/GLM/Kimi/Gemini反代共六源，默认留空让用户选。
- 2026-06-12: **形象来源修正**——用户要「现成的线条小狗素材」而非自绘。调研结论：线条小狗
  是 moonlab_studio 版权 IP、无开源授权，仅免费合集(爱给网/简书/Sigstick)可个人非商用。
  决定：默认用免费无水印素材映射三态 + 保留上传自定义 + 自绘作 fallback；**仓库设 private**
  规避版权再分发风险。
- 2026-06-12: 建私有仓库 github.com/thedoub1e/doubleagent，治理基线已 push main。
- 2026-06-12: **产品用意补充**——交付对象是国外留学的伴侣，定位「数字陪伴者」，须实现
  陪伴/监督/聊天/解惑四大功能；默认人设=留学伴侣陪伴小狗。
- 2026-06-12: **拍板**——(1)「监督」首版即做**主动定时提醒/打卡 + macOS 系统通知**(加轻量
  调度器)；(2) 四大功能用意**写进 Principal 的 End Goal**(已解锁→改→重新上锁)。
- 2026-06-13: **优先级翻转**——用户："主动 agent 才是灵魂,否则和传统 LLM 桌面无异"。改为
  **主动 agent 先做、记忆次做**；主动先上薄片 v0 = **对话转待办**(注册 create_reminder 安全工具→
  osascript 写原生提醒→人话回执,时间型提醒白嫖 OS 到点弹)。立「主动」北极星四支柱(触发/改变世界/
  闭环/克制)。Plan 翻转 Current Objective + 重排 TODO(主动在前+薄片拆解) + 方案加薄片 v0 规格。
- 2026-06-13: **开源调研收获折进方案**（并行扒 3 类项目源码：桌宠化身/主动助手/记忆陪伴）。
  记忆：方向被 mem0/LangMem/Letta 验证(确认不上向量库);改进=矛盾用 UPDATE 不 DELETE(避 mem0 #1 bug)、
  停顿/空闲时抽取(LangMem debounce+Letta sleep-time)、加 factType/confidence/supersedes/constant 字段、
  persona 设抽取只读。主动/原生：安全红线=只给白名单工具绝不执行任意 osascript(Open-Interpreter 教训)、
  正确性=提醒规则持久化+启动补发漏发、bounded 节奏+静默开关(Leon/Khoj)、人话回执、osascript 实操配方。
  化身：偷 amica `[emotion]` 标签从实际 gif 桶选。TCC 风险按用户拍板调轻(点允许即可)。
- 2026-06-13: **主线二立项·原生集成+主动 agent**——用户要它"真有用、主动提醒、不用天天问"。
  拍板：接 提醒事项读写/日历读取/天气；**不依赖 iPhone**(主通道=小狗自身通知,写原生提醒只为本机
  可核销清单)；时间关怀**只用本机时间、无时差**；先做 对话转待办/晨晚简报/行程ddl前置。技术=
  osascript+pi-agent-core 安全工具(绝不引file/bash),风险=TCC权限需教程兜底+优雅降级。与记忆升级
  并行排期、记忆先收口。拓展 backlog：解锁问候/久坐感知/倒数日·纪念日/番茄钟streak/主动找话题。
  另：抽取成本结论=非问题(月 ¥5–40),但抽取改用便宜档模型,设置加可选「记忆模型」。
- 2026-06-13: **记忆升级立项**——用户指出现状(单段滚动摘要)不够"越聊越懂"，要 Clarvis 式
  自动沉淀用户画像。拍板：(1) 抽取时机=每轮增量抽取+信号门控(闲聊不写,省 key)；(2) 做
  「小狗眼中的你」面板,可看可编辑；(3) 范围=明确事实+克制推断标签(身份/喜好/在意/约定/性格倾向)。
  方案=新增结构化离散事实库(profile.json)与现有滚动摘要并存,详见「记忆升级方案」。
- 2026-06-12: **功能优先·重评估模型层**——用户要求重新评估 piagent。查实 Pi(`@earendil-works/
  pi-ai`,MIT,TS/Node) 与 Electron 单栈兼容，原生支持 DeepSeek/MiniMax/GLM/Kimi + 任意 OpenAI
  兼容(通义/Gemini反代)，白送流式+工具调用+成本统计+上下文持久化。**决定改用 pi-ai 作模型层**，
  弃手写客户端；记忆学 Clarvis(Hindsight/Cognee 是 Python 故不搬)改 TS 轻量实现；不引 pi-tui/
  pi-coding-agent 的 bash/file 工具。✅ **用户确认：采用 pi-ai，功能优先，接受依赖变重。**
