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
