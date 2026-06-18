#!/bin/bash
# 线条小狗 · 一条命令全自动安装（macOS）
# 用法：在「你想放小狗的文件夹」里打开终端，粘这一行：
#   /bin/bash -c "$(curl -fsSL https://raw.githubusercontent.com/thedoub1e/doubleagent/main/scripts/setup.sh)"
# 小狗就装进你当前所在的这个文件夹。幂等：已装过就拉最新版。
# 不碰任何聊天记录/记忆（存在系统应用数据目录，与代码物理隔离）。
set -e
REPO="https://github.com/thedoub1e/doubleagent.git"

echo "🐶 准备安装线条小狗，整个过程几分钟，跟着提示走就好～"
echo ""

# 1) Homebrew（macOS 软件管家）—— 没有就装
if ! command -v brew >/dev/null 2>&1; then
  echo "📦 先装 Homebrew（可能让你输一次开机密码、按一次回车确认，这是 Mac 装软件的正常步骤）…"
  NONINTERACTIVE=1 /bin/bash -c "$(curl -fsSL https://raw.githubusercontent.com/Homebrew/install/HEAD/install.sh)"
fi
# 把 brew 加进当前会话 PATH（Apple 芯片在 /opt/homebrew，Intel 在 /usr/local）
[ -x /opt/homebrew/bin/brew ] && eval "$(/opt/homebrew/bin/brew shellenv)"
[ -x /usr/local/bin/brew ] && eval "$(/usr/local/bin/brew shellenv)"
# 让以后新开的终端也能找到 brew/node（写进 ~/.zprofile，幂等）—— 这样「检查更新/双击更新」以后也能用
BREW_BIN="$(command -v brew || true)"
if [ -n "$BREW_BIN" ] && ! grep -q 'brew shellenv' "$HOME/.zprofile" 2>/dev/null; then
  echo "eval \"\$(${BREW_BIN} shellenv)\"" >>"$HOME/.zprofile"
fi

# 2) Node + git（用 brew 装，已装则跳过）
if ! command -v node >/dev/null 2>&1; then echo "📥 安装 Node…"; brew install node; fi
if ! command -v git >/dev/null 2>&1; then echo "📥 安装 git…"; brew install git; fi

# 3) 决定装在哪：默认就装进「你现在打开终端所在的这个文件夹」。
is_our_repo() { [ -d "$1/.git" ] && git -C "$1" remote get-url origin 2>/dev/null | grep -qi 'doubleagent'; }
TARGET="$PWD"
if is_our_repo "$TARGET"; then
  echo "🔄 这个文件夹里已经有小狗了，拉取最新版…"
  git -C "$TARGET" pull --ff-only
else
  # 当前文件夹除 .DS_Store 外是否为空
  LEFTOVER="$(ls -A "$TARGET" 2>/dev/null | grep -vx '.DS_Store' || true)"
  if [ -z "$LEFTOVER" ]; then
    rm -f "$TARGET/.DS_Store" 2>/dev/null || true
    echo "⬇️  下载小狗到当前文件夹：$TARGET"
    git clone "$REPO" "$TARGET"
  else
    TARGET="$PWD/doubleagent"
    if is_our_repo "$TARGET"; then
      echo "🔄 拉取最新版…"
      git -C "$TARGET" pull --ff-only
    else
      echo "⬇️  当前文件夹里有别的东西，下载小狗到子文件夹：$TARGET"
      git clone "$REPO" "$TARGET"
    fi
  fi
fi
cd "$TARGET"

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
echo "   它就装在：$TARGET"
echo "   之后想更新：点小狗「设置 → 检查更新」即可，聊天和记忆都不会丢 💚"
echo ""
