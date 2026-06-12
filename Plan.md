# Plan

_单一事实来源（Source of truth）。始终保持本文件最新。_
_Last updated: 2026-06-12_

## Current Objective
治理初始化 + 架构方案**已定稿、四项 Open Question 全部拍板**。下一步进入实现：先搭
Electron 单栈骨架（透明置顶桌宠窗口）。

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

**模型层**：OpenAI 兼容 `/chat/completions` 单一抽象，配置 = `baseURL + apiKey + model`。
内置预设（全部）：**DeepSeek、通义千问(DashScope 兼容)、智谱 GLM、Kimi(Moonshot)、
MiniMax、Gemini 反代(OpenAI 格式)**。默认**留空让用户选**，设置面板粘贴即用，存本地 userData。

**首版范围**：纯文字聊天 MVP **+ 对话记忆**（本地持久化多轮历史 / 长期记忆，仍纯文字）。
语音(TTS/ASR) 留到后续迭代。

**保姆级安装（核心难点）**：
- `安装.command`（双击）：检测/安装 Homebrew → 安装 Node → `npm install` → 完成。
- `启动小狗.command`（双击）：`npm start` 拉起桌宠。
- 配套图文教程（README + 截图/PDF）：如何拿 API Key、双击哪个文件、首次 macOS
  安全提示怎么点。
- 兜底：把已知坑（Node 没装、网络慢、权限提示、Apple Silicon 架构）写进 Errors.md
  与教程 FAQ。

## TODO
- [ ] 搭骨架：Electron + Vite + TS 项目脚手架（透明置顶桌宠窗口 + 点击穿透 + 可拖动）
- [ ] 线条小狗形象：从免费无水印合集(爱给网等)挑选素材，映射待机/思考/回复三态；自绘风格作 fallback
- [ ] 形象自定义：支持用户上传图片替换默认小狗（本地 userData，不进 git）
- [ ] 聊天面板：类 Gemini 对话 UI（流式输出、Markdown 渲染）
- [ ] 对话记忆：本地持久化多轮历史 / 长期记忆（纯文字）
- [ ] 模型层：OpenAI 兼容 client + 6 源预设（DeepSeek/通义/GLM/Kimi/MiniMax/Gemini反代）+ 设置面板（baseURL/key/model）
- [ ] 配置与密钥：本地存储、`.env.example`、`.gitignore` 屏蔽密钥（已建 .gitignore）
- [ ] 保姆级安装：`安装.command` / `启动小狗.command` 脚本 + 自启动（可选登录项）
- [ ] 图文教程：拿 API Key、安装、首次启动、常见报错 FAQ
- [ ] 测试：模型层单测、安装脚本在干净 Mac 上的演练、聊天 E2E
- [ ] 在自己机器上完整演练「对方视角」：从 0 拉仓库到能聊天

## In Progress
- [ ] （待开始）Electron 单栈骨架

## Done
- [x] 调研可二开/参考的开源桌宠项目（Open-LLM-VTuber 等 + 用户指定的 Clarvis）
- [x] 确认四项关键决策：子文件夹 doubleagent/ / 参考 Clarvis / GitHub pull 分发 / 不付费签名
- [x] 建 doubleagent/ 子文件夹 + git init + 起草 Principal/Plan/Errors/AOL + .gitignore
- [x] **定稿四项 Open Question**：Electron 单栈 / 自绘+可上传形象 / MVP+对话记忆 / 六源含 MiniMax 默认留空

## Open Questions / Decisions
- ~~架构底座~~ → ✅ 采纳 Electron 单栈 + 从源码运行 + 不 fork Clarvis。
- ~~形象来源~~ → ✅ 自绘扁平线条小狗为默认 + 支持用户上传图片自定义（不商用）。
- ~~首版范围~~ → ✅ 纯文字聊天 MVP + 对话记忆；语音留后续。
- ~~默认模型源~~ → ✅ 六源全做预设（含 MiniMax），默认留空让用户选。
- （新）对话记忆的形态：先做「本地会话历史 + 可选系统人设」，长期记忆（向量/摘要）作为后续增强？— 待实现阶段细化

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
