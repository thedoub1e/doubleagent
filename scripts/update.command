#!/bin/bash
# 线条小狗 · 手动更新（macOS）
# 一般用不到——在小狗「设置 → 检查更新」点一下更省事。这个脚本是备用。
# 同样不碰你的聊天记录和记忆（它们在系统应用数据目录里，跟代码隔离）。

set -e
chmod +x "$0" 2>/dev/null || true  # 自愈执行位（浏览器下载会丢）
DIR="$HOME/doubleagent"

if [ ! -d "$DIR/.git" ]; then
  echo "⚠️  还没安装呢，请先双击 install.command 安装。"
  exit 1
fi

cd "$DIR"
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
