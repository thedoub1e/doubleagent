#!/bin/bash
# 线条小狗 · 双击安装（macOS）
# 这是给「已经下载了小狗文件夹」的情况用的——双击我，会跑同一套一键安装(setup.sh)：
# 装好需要的工具(Homebrew/Node) → 拉最新代码 → 构建 → 启动。幂等，可重复跑。
# 第一次安装更推荐用「安装说明.md」里的一行命令（连下载都帮你做）。
chmod +x "$0" 2>/dev/null || true  # 自愈执行位（浏览器下载会丢，双击才需要）
HERE="$(cd "$(dirname "$0")" && pwd)"
exec bash "$HERE/setup.sh"
