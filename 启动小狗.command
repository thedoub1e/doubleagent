#!/bin/bash
# 双击我，唤出桌面上的「线条小狗」🐶
cd "$(dirname "$0")" || exit 1
clear
echo "🐶 正在唤醒线条小狗…"
echo ""

if ! command -v node >/dev/null 2>&1; then
  echo "⚠️  还没装 Node.js —— 请先双击「安装.command」。"
  read -n 1 -s -r -p "按任意键退出…"
  exit 1
fi

if [ ! -d node_modules ]; then
  echo "⚠️  还没安装依赖 —— 请先双击「安装.command」。"
  read -n 1 -s -r -p "按任意键退出…"
  exit 1
fi

echo "（保持这个黑窗口开着，小狗就一直在桌面陪你；关掉窗口＝小狗下班 😴）"
echo ""
npm start
