#!/bin/bash
# 双击我即可安装「线条小狗」🐶（macOS）
cd "$(dirname "$0")" || exit 1
clear
echo "🐶 线条小狗 · 安装向导"
echo "===================================="
echo ""

# 1) 检查 Node.js
if ! command -v node >/dev/null 2>&1; then
  echo "⚠️  没检测到 Node.js（运行小狗需要它）。"
  echo "→ 我帮你打开 Node.js 官网下载页，请下载并安装【LTS 版本】，"
  echo "   一路点「继续 / 同意 / 安装」装好后，回到这里【再次双击 安装.command】。"
  echo ""
  open "https://nodejs.org/zh-cn/download/prebuilt-installer" 2>/dev/null
  read -n 1 -s -r -p "装好 Node 后，按任意键关闭此窗口…"
  exit 0
fi
echo "✓ 已检测到 Node.js：$(node -v)"
echo ""

# 2) 安装依赖（走国内镜像，避免 Electron 运行时卡下载）
echo "📦 正在安装依赖，第一次会下载较多内容，请耐心等几分钟…"
echo "   （期间请保持联网，不要关窗口）"
echo ""
export ELECTRON_MIRROR="https://npmmirror.com/mirrors/electron/"
if ! npm install --registry=https://registry.npmmirror.com; then
  echo ""
  echo "❌ 安装依赖失败了。多半是网络问题，请连好网后再次双击「安装.command」。"
  read -n 1 -s -r -p "按任意键关闭此窗口…"
  exit 1
fi

# 3) 确保 Electron 运行时就位
if [ ! -d "node_modules/electron/dist/Electron.app" ]; then
  echo ""
  echo "↻ 正在补下载 Electron 运行时（国内镜像）…"
  node node_modules/electron/install.js || true
fi

echo ""
echo "===================================="
echo "✅ 安装完成！现在双击「启动小狗.command」就能见到它啦 🐶"
echo ""
read -n 1 -s -r -p "按任意键关闭此窗口…"
