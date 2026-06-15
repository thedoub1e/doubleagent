// 自更新（热升级）副作用层：真正跑 git/npm。判定与解析都在纯函数 updateUtil.ts。
// 安全：execFile 数组传参（无 shell 注入）；只对 app 所在的 git 仓库操作；只快进 pull；
// build 失败自动 git reset --hard 回滚旧版重启，绝不把用户留在打不开的小狗前。
// 数据安全：所有用户记录在 userData（仓库外），git pull/reset 物理上够不着，升级不丢记录。
import { execFile } from 'node:child_process'
import { promisify } from 'node:util'
import { app } from 'electron'
import {
  describeUpdate,
  friendlyUpdateError,
  isUpdateAvailable,
  isWorkingTreeClean,
  needsNpmInstall,
  parseBehindCount,
  parseBranch,
  parseChangedFiles,
  parseSha
} from './updateUtil'

const run = promisify(execFile)
const GIT_TIMEOUT_MS = 60_000
const BUILD_TIMEOUT_MS = 5 * 60_000
const MAX_BUFFER = 16 * 1024 * 1024

export interface UpdateStatus {
  ok: boolean
  available: boolean
  behind: number
  message: string
  error?: string
}

export interface ApplyResult {
  ok: boolean
  relaunching: boolean
  rolledBack: boolean
  message: string
}

type ProgressFn = (msg: string) => void

function errText(e: unknown): string {
  if (e instanceof Error) return `${e.message}`
  return String(e)
}

async function git(args: string[], cwd: string, timeout = GIT_TIMEOUT_MS): Promise<string> {
  const { stdout } = await run('git', ['-C', cwd, ...args], { timeout, maxBuffer: MAX_BUFFER })
  return stdout
}

async function npm(args: string[], cwd: string): Promise<void> {
  await run('npm', args, { cwd, timeout: BUILD_TIMEOUT_MS, maxBuffer: MAX_BUFFER })
}

/** 解析 app 所在的 git 仓库根；非 git 仓库（如 ZIP 解压）返回 null。 */
async function resolveRepoRoot(): Promise<string | null> {
  const start = app.getAppPath()
  try {
    const top = (await git(['rev-parse', '--show-toplevel'], start)).trim()
    return top.length > 0 ? top : null
  } catch {
    return null
  }
}

/** 检查 GitHub 是否有新版（git fetch + 比对落后提交数）。只读，不改任何东西。 */
export async function checkForUpdate(): Promise<UpdateStatus> {
  const dir = await resolveRepoRoot()
  if (!dir) {
    return {
      ok: false,
      available: false,
      behind: 0,
      message: '',
      error: '这份小狗不是用 GitHub Desktop / clone 装的，没法自动更新呢'
    }
  }
  try {
    const branch = parseBranch(await git(['rev-parse', '--abbrev-ref', 'HEAD'], dir))
    await git(['fetch', 'origin', branch, '--quiet'], dir)
    const local = parseSha(await git(['rev-parse', 'HEAD'], dir))
    const remote = parseSha(await git(['rev-parse', `origin/${branch}`], dir))
    const behind = parseBehindCount(await git(['rev-list', '--count', `HEAD..origin/${branch}`], dir))
    return {
      ok: true,
      available: isUpdateAvailable(local, remote, behind),
      behind,
      message: describeUpdate(behind)
    }
  } catch (e) {
    return { ok: false, available: false, behind: 0, message: '', error: friendlyUpdateError(errText(e)) }
  }
}

/**
 * 应用更新：记录旧 SHA → 校验工作区干净 → git pull --ff-only →（依赖变了才）npm install → npm run build。
 * 任一步失败 → git reset --hard 回旧 SHA + 重建旧版，返回 rolledBack。成功 → relaunching=true（调用方负责重启）。
 */
export async function applyUpdate(onProgress: ProgressFn = () => {}): Promise<ApplyResult> {
  const dir = await resolveRepoRoot()
  if (!dir) {
    return {
      ok: false,
      relaunching: false,
      rolledBack: false,
      message: '这份小狗不是用 GitHub Desktop / clone 装的，没法自动更新呢'
    }
  }

  let beforeSha = ''
  let installedDuringUpdate = false
  try {
    beforeSha = parseSha(await git(['rev-parse', 'HEAD'], dir))

    // 工作区脏（有人改过代码）→ 中止保平安，绝不强更覆盖。
    const porcelain = await git(['status', '--porcelain'], dir)
    if (!isWorkingTreeClean(porcelain)) {
      return {
        ok: false,
        relaunching: false,
        rolledBack: false,
        message: '本地代码有改动，我先不自动更新了，免得出乱子（你的记录都是安全的）🐶'
      }
    }

    const branch = parseBranch(await git(['rev-parse', '--abbrev-ref', 'HEAD'], dir))
    onProgress('正在下载新版本…')
    await git(['pull', '--ff-only', 'origin', branch], dir)

    const changed = parseChangedFiles(await git(['diff', '--name-only', `${beforeSha}..HEAD`], dir))
    if (needsNpmInstall(changed)) {
      installedDuringUpdate = true
      onProgress('正在更新依赖（可能要一会儿）…')
      await npm(['install'], dir)
    }
    onProgress('正在重建小狗…')
    await npm(['run', 'build'], dir)

    onProgress('更新好啦，马上重启一下～')
    return { ok: true, relaunching: true, rolledBack: false, message: '更新完成，正在重启 🐶' }
  } catch (e) {
    // 回滚：退回旧 SHA + 重建旧版，确保她还有一只能打开的小狗。
    try {
      if (beforeSha.length > 0) {
        onProgress('更新没成功，正在帮你退回原来的版本…')
        await git(['reset', '--hard', beforeSha], dir)
        if (installedDuringUpdate) await npm(['install'], dir).catch(() => {})
        await npm(['run', 'build'], dir).catch(() => {})
      }
      return {
        ok: false,
        relaunching: false,
        rolledBack: true,
        message: `这次更新没成功，我已经回到原来的样子啦，你的记录都在 🐶（${friendlyUpdateError(errText(e))}）`
      }
    } catch {
      return {
        ok: false,
        relaunching: false,
        rolledBack: false,
        message: '更新出了点问题，麻烦回头找人帮我看看～你的聊天和记忆都是安全的，没丢'
      }
    }
  }
}
