# Plan

_单一事实来源（Source of truth）。始终保持本文件最新。_
_Last updated: 2026-06-13_

## Current Objective
**优先级 2026-06-13 翻转**（用户：主动 agent 才是灵魂，否则与传统 LLM 桌面无异）→ 主动 agent 先上薄片，记忆次做：
- **主线二（先做）🚀 主动 Agent**：先上一条能跑通的薄片 = **对话转待办**，再逐步补简报/前置提醒/闭环。
  从"会聊天的桌宠"→"真正管事、主动提醒、不用天天问"。详见「原生集成 + 主动 Agent 能力方案」。
- **主线一（次做）🧠 记忆升级**：「单段滚动摘要」→「结构化用户画像 + 离散事实库」(Mem0 思路)，
  让小狗越聊越懂她。详见「记忆升级方案」。（记忆做好后，主动会"更懂你地主动"——两者最终合流。）

**「主动」的北极星（四支柱，设计时对照）**：① 主动触发(到点/日历/空闲/ddl/久未聊/情境) ②
能改变世界(把话变成真的提醒/勾掉待办,而非只回"好的") ③ 闭环跟进(记得提醒过→回来问做了没→再轻推)
④ 克制(bounded 节奏+静默开关+挑时机,主动而不烦人)。支柱②③是普通 LLM 桌宠没有的差异点。

（四大功能 + 安装链路已就绪；剩余收尾项：README 截图 / 伴侣国外实测 / 登录项自启动。）

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
- [ ] set_briefing 对话工具(简报时间/开关可对话改)—— 已向用户提议，待定（当前简报固定 08:30/22:00）
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
- [ ] 动图集形象（用户 2026-06-12 改主意，放弃精灵图）：用户在 `gif图/` 放了 10 个 `小白_<行为>.webp` 线条小狗动图，要「尽可能都用上」。
  方案：启动扫 gif图/，按文件名关键词归类(待机/思考/回复/提醒)，按情绪随机播放+待机轮换。形象优先级 精灵图>单图>**动图集**>自绘狗。动图随仓库分发(private)。
- [x] 长期记忆：滚动摘要式（memory.json，超24条压缩旧对话进摘要注入人设）
- [x] 单元测试：vitest，markdown(10)/providers(4)/scheduleUtil(4) 共 18 测全过
- [ ] README 截图 + 伴侣在国外实测一次（确认 api.minimaxi.com 境外可达）—— 待真机
- [~] 登录项自启动：**暂不做**。从源码 npm start 运行下 setLoginItemSettings 指向 Electron 可执行档而非 npm 启动，跑不起来；正解是 LaunchAgent 调 npm start，但 node PATH 对小白脆弱易坏。双击 启动小狗.command 更稳。

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
