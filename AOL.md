# Append-Only Log (AOL)

> Append-only. Never edit or delete past entries. Add entries only via
> `bash ~/.claude/hooks/aol-append.sh "/Users/caizhizhi/doublesCodes/项目/doubleagent" "<message>"`.
- [2026-06-12 14:22:01 +0800] fr0m init: 建 doubleagent/ 子仓(git) + Principal/Plan/Errors/AOL；定稿推荐架构(Electron 单栈+从源码运行+OpenAI兼容模型层，参考Clarvis不fork)；等用户确认计划后再动代码
- [2026-06-12 14:22:34 +0800] 新增 .gitignore：屏蔽 .env/密钥/node_modules/dist 等；保留 .env.example。结果：密钥从第一天起不进 git
- [2026-06-12 14:33:23 +0800] 讨论目标：拍板四项 Open Question —— Electron 单栈+从源码运行+不fork Clarvis；默认自绘线条小狗+支持用户上传图片自定义；首版纯文字MVP+对话记忆；模型预设新增MiniMax(共六源)默认留空。已折进 Plan.md 定稿
- [2026-06-12 14:38:56 +0800] 形象来源修正：调研线条小狗资源——确认是 moonlab_studio 版权IP无开源授权，仅免费合集(爱给网/简书/Sigstick)可个人非商用。改用现成免费素材映射三态+保留上传+自绘fallback，仓库定 private 规避再分发风险。已折进 Plan。确认 gh 已登录 thedoub1e 可直接建库
