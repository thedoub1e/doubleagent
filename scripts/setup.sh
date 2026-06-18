#!/bin/bash
# 线条小狗 · 一条命令全自动安装（macOS）
# 用法（终端粘一行）：
#   /bin/bash -c "$(curl -fsSL https://raw.githubusercontent.com/thedoub1e/doubleagent/main/scripts/setup.sh)"
# 幂等：已装过就拉最新版。不碰任何聊天记录/记忆（存在系统应用数据目录，与代码物理隔离）。
set -e
REPO="https://github.com/thedoub1e/doubleagent.git"
DIR="$HOME/doubleagent"

echo "🐶 准备安装线条小狗，整个过程几分钟，跟着提示走就好～"
echo ""

# 1) Homebrew（macOS 的软件管家）—— 没有就装
if ! command -v brew >/dev/null 2>&1; then
  echo "📦 先装 Homebrew（可能让你输一次开机密码、按一次回车确认，这是 Mac 装软件的正常步骤）…"
  NONINTERACTIVE=1 /bin/bash -c "$(curl -fsSL https://raw.githubusercontent.com/Homebrew/install/HEAD/install.sh)"
fi
# 把 brew 加进当前会话 PATH（Apple 芯片在 /opt/homebrew，Intel 在 /usr/local）
[ -x /opt/homebrew/bin/brew ] && eval "$(/opt/homebrew/bin/brew shellenv)"
[ -x /usr/local/bin/brew ] && eval "$(/usr/local/bin/brew shellenv)"

# 2) Node + git（用 brew 装，已装则跳过）
if ! command -v node >/dev/null 2>&1; then echo "📥 安装 Node…"; brew install node; fi
if ! command -v git >/dev/null 2>&1; then echo "📥 安装 git…"; brew install git; fi

# 3) 下载小狗（git clone 会自动建 ~/doubleagent 文件夹，不用你手动建）
if [ -d "$DIR/.git" ]; then
  echo "🔄 已经装过啦，拉取最新版…"
  git -C "$DIR" pull --ff-only
else
  echo "⬇️  下载小狗到 $DIR …"
  git clone "$REPO" "$DIR"
fi
cd "$DIR"

# 4) 装依赖 + 构建
echo "🔧 安装依赖 + 构建（第一次久一点，泡杯茶☕）…"
npm install
npm run build

# 5) 启动（后台运行，关掉终端也不受影响）
echo "🚀 启动小狗…"
pkill -f "electron-vite preview" 2>/dev/null || true
nohup ./node_modules/.bin/electron-vite preview >/tmp/doubleagent-run.log 2>&1 &

echo ""
echo "✅ 全部搞定！小狗过几秒就会出现在桌面右下角 🐶（第一次启动稍慢，耐心等几秒，别重复跑）"
echo "   它住在「你的用户文件夹 / doubleagent」。"
echo "   之后想更新：点小狗「设置 → 检查更新」即可，聊天和记忆都不会丢 💚"
echo ""
