# Plan

_单一事实来源（Source of truth）。始终保持本文件最新。_
_Last updated: 2026-06-12_

## Current Objective
✅ 四大功能 + 安装链路基本就绪：聊天(流式+Markdown+记忆) / 监督(定时提醒+通知) / 陪伴(情绪+人设)
/ 解惑；自定义形象；六源预设；`安装.command`+`启动小狗.command`+README。
**剩余**：长期记忆(滚动摘要) / 单元测试 / README 截图 / 伴侣国外实测 / 登录项自启动。

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
- [ ] 线条小狗形象：从免费无水印合集(爱给网等)挑选素材，映射待机/思考/回复三态；自绘风格作 fallback（当前是自绘占位）
- [x] 形象自定义：设置面板选图片/GIF→存 userData→data URL 推渲染层<img>(GIF自带动画)；可恢复默认自绘狗。即「现成线条小狗素材」的版权干净落地（用户自备图）
- [x] 聊天面板：类 Gemini 对话 UI（流式输出 + Markdown 渲染 + 外链系统浏览器打开）—— 独立聊天窗
- [~] 模型层：集成 `@earendil-works/pi-ai`（主进程跑，key 不进渲染层）；MiniMax 已接，余源待补预设
- [x] 对话记忆：本地全量历史持久化 + 滚动摘要式长期记忆(memory.json,超24条把旧的压缩进摘要注入人设,保留最近10条原文;清空对话同时清记忆)
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
- [x] 精灵图(sprite sheet)动画支持：sprite.ts(rAF 分帧,行=状态/列=帧,按情绪切行);形象优先级 精灵图>单图/GIF>默认狗,统一 pet:visual 下发;设置面板 选精灵图+行/列/帧率+应用/清除。用户将自备线条小狗精灵图(类 Clarvis)。
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
- 2026-06-12: **功能优先·重评估模型层**——用户要求重新评估 piagent。查实 Pi(`@earendil-works/
  pi-ai`,MIT,TS/Node) 与 Electron 单栈兼容，原生支持 DeepSeek/MiniMax/GLM/Kimi + 任意 OpenAI
  兼容(通义/Gemini反代)，白送流式+工具调用+成本统计+上下文持久化。**决定改用 pi-ai 作模型层**，
  弃手写客户端；记忆学 Clarvis(Hindsight/Cognee 是 Python 故不搬)改 TS 轻量实现；不引 pi-tui/
  pi-coding-agent 的 bash/file 工具。✅ **用户确认：采用 pi-ai，功能优先，接受依赖变重。**
