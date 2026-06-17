#!/bin/bash
# 线条小狗 · 一键安装/部署（macOS）
# 用法：双击本文件，或在终端运行  bash scripts/install.command
# 幂等：已装过就拉最新版。全程不碰你的聊天记录和记忆——它们存在系统的
#       「应用数据目录」(~/Library/Application Support/doubleagent/)，跟代码物理隔离，更新够不着。

set -e
REPO="https://github.com/thedoub1e/doubleagent.git"
DIR="$HOME/doubleagent"

echo "🐶 开始安装线条小狗…"
echo ""

# 1) 检查 git（macOS 缺它会弹出「命令行工具」安装窗）
if ! command -v git >/dev/null 2>&1; then
  echo "⚠️  需要先装一个「命令行工具」，马上会弹窗 —— 请点【安装】。"
  echo "    装完之后，再双击我一次就好啦。"
  xcode-select --install || true
  exit 1
fi

# 2) 检查 Node.js（自带 npm）
if ! command -v npm >/dev/null 2>&1; then
  echo "⚠️  需要先装 Node.js。我帮你打开下载页 —— 选 LTS 版，下载 .pkg 双击装好，"
  echo "    然后再双击我一次。"
  open "https://nodejs.org/zh-cn" || true
  exit 1
fi

# 3) 下载或更新代码（git 只动代码，碰不到你的记录）
if [ -d "$DIR/.git" ]; then
  echo "📦 已经装过啦，拉取最新版…"
  git -C "$DIR" pull --ff-only
else
  echo "📦 下载小狗到 $DIR …"
  git clone "$REPO" "$DIR"
fi
cd "$DIR"

# 4) 装依赖 + 构建
echo "📥 安装依赖（第一次会久一点，泡杯茶～）…"
npm install
echo "🔨 构建小狗…"
npm run build

# 5) 启动（后台运行，关掉终端也不受影响）
echo "🚀 启动小狗…"
pkill -f "electron-vite preview" 2>/dev/null || true
nohup ./node_modules/.bin/electron-vite preview >/tmp/doubleagent-run.log 2>&1 &

echo ""
echo "✅ 装好啦！小狗已经出现在桌面右下角 🐶"
echo ""
echo "接下来："
echo "  • 点小狗打开聊天窗，第一次在「设置」里填一下模型（若已替你填好就跳过）。"
echo "  • 想让它开机自动出现：在「设置」里勾上「开机自动启动」。"
echo "  • 以后想更新：打开小狗「设置 → 检查更新」点一下就行——你的聊天和记忆都不会丢。"
echo ""
