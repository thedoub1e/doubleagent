// 纯函数（无 IO）：自更新（热升级）的 git 输出解析与判定。可单测。
// 副作用（真正跑 git/npm）在 updater.ts；这里只做解析与决策，便于测试与审计。

/** git rev-parse 输出 → 去空白的 sha（取首行）。空/异常返回 ''。 */
export function parseSha(stdout: string): string {
  return (stdout.trim().split('\n')[0] ?? '').trim()
}

/** git rev-list --count HEAD..origin/branch 输出 → 落后提交数。非法→0。 */
export function parseBehindCount(stdout: string): number {
  const n = Number(stdout.trim())
  return Number.isFinite(n) && n >= 0 ? Math.floor(n) : 0
}

/** git rev-parse --abbrev-ref HEAD → 当前分支名；detached/空 → 'main' 兜底。 */
export function parseBranch(stdout: string): string {
  const b = stdout.trim()
  return b.length > 0 && b !== 'HEAD' ? b : 'main'
}

/** 是否有更新：本地/远端 sha 都拿到、不相同、且确实落后。 */
export function isUpdateAvailable(localSha: string, remoteSha: string, behind: number): boolean {
  return localSha.length > 0 && remoteSha.length > 0 && localSha !== remoteSha && behind > 0
}

/** git diff --name-only 输出 → 文件名数组。 */
export function parseChangedFiles(stdout: string): string[] {
  return stdout
    .split('\n')
    .map((s) => s.trim())
    .filter(Boolean)
}

/** pull 后变更文件里是否含依赖清单 → 决定要不要 npm install。 */
export function needsNpmInstall(changedFiles: readonly string[]): boolean {
  return changedFiles.some(
    (f) => /(^|\/)package-lock\.json$/.test(f) || /(^|\/)package\.json$/.test(f)
  )
}

/** 工作区是否干净（git status --porcelain 为空＝干净）。脏则不敢自动更新，保平安。 */
export function isWorkingTreeClean(porcelain: string): boolean {
  return porcelain.trim().length === 0
}

/** 给电脑小白看的更新提示文案（绝不暴露 git 术语）。 */
export function describeUpdate(behind: number): string {
  if (behind <= 0) return '我已经是最新版啦，状态很好～🐶'
  return `我发现有新版本啦！要现在更新我吗？更新时我会重启一下，你和我的聊天记录、还有我记住你的事都不会丢哦 🐶`
}

/** 把 git/npm 的原始报错翻成友好提示（不泄露路径/堆栈）。 */
export function friendlyUpdateError(raw: string): string {
  if (/ENOENT|command not found|not found/i.test(raw)) {
    return '我在你电脑上没找到 git 或 npm 工具，没法自己更新——可能要先装一下开发环境'
  }
  if (/could not resolve host|network|timed out|timeout|Connection/i.test(raw)) {
    return '网络好像没连上，等下再试一次更新吧'
  }
  if (/not a git repository|--show-toplevel/i.test(raw)) {
    return '这份小狗不是用 GitHub Desktop / clone 装的，没法自动更新呢'
  }
  if (/Not possible to fast-forward|diverge|non-fast-forward/i.test(raw)) {
    return '本地代码和新版对不上，我先不强更了，免得出乱子（你的记录是安全的）'
  }
  return '更新时出了点小问题，等下再试试吧（你的记录都在）'
}
