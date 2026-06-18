#!/bin/bash
# 线条小狗 · 双击更新（macOS）
# 一般用不到——在小狗「设置 → 检查更新」点一下更省事。这是备用。
# 操作的是「本脚本所在的这只小狗」(无论你把它装在哪)，不碰你的聊天记录和记忆。
set -e
chmod +x "$0" 2>/dev/null || true
# 让 node/brew 在 PATH 上（双击时是登录 shell，已由安装时写入 ~/.zprofile，这里再保险一次）
[ -x /opt/homebrew/bin/brew ] && eval "$(/opt/homebrew/bin/brew shellenv)"
[ -x /usr/local/bin/brew ] && eval "$(/usr/local/bin/brew shellenv)"

REPO_ROOT="$(cd "$(dirname "$0")/.." && pwd)" # 本脚本在 <小狗文件夹>/scripts/ 下
cd "$REPO_ROOT"

echo "🐶 拉取最新版…"
git pull --ff-only
echo "📥 更新依赖…"
npm install
echo "🔨 重建小狗…"
npm run build
echo "🔁 重启小狗…"
pkill -f "electron-vite preview" 2>/dev/null || true
nohup ./node_modules/.bin/electron-vite preview >/tmp/doubleagent-run.log 2>&1 &
echo ""
echo "✅ 更新完成！你的聊天和记忆都在 🐶"
