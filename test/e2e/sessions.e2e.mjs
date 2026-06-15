// E2E：用 Playwright 的 _electron 真启动 App，真点左侧会话栏，验证 UI 交互接线。
// 用隔离的临时 userData（--user-data-dir），绝不碰用户真实数据。
// 跑：node test/e2e/sessions.e2e.mjs   （需先 npm run build）
import { _electron as electron } from 'playwright'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

const userDataDir = mkdtempSync(join(tmpdir(), 'da-e2e-'))
let pass = 0
let fail = 0
const ok = (name) => {
  pass++
  console.log(`  ✓ ${name}`)
}
const bad = (name, detail) => {
  fail++
  console.log(`  ✗ ${name}  —— ${detail}`)
}
const check = (name, cond, detail = '') => (cond ? ok(name) : bad(name, detail))
const sleep = (ms) => new Promise((r) => setTimeout(r, ms))

const app = await electron.launch({ args: ['.', `--user-data-dir=${userDataDir}`] })

try {
  // 拿到聊天窗（url 含 chat），并确保其 DOM 就绪。
  let chat = null
  for (let i = 0; i < 40 && !chat; i++) {
    for (const w of app.windows()) {
      const url = w.url()
      if (url.includes('chat')) chat = w
    }
    if (!chat) await sleep(150)
  }
  if (!chat) throw new Error('找不到聊天窗(chat.html)')
  await chat.waitForSelector('#session-list', { timeout: 8000 })
  await sleep(400) // 等启动期 refreshSessions / renderHistory 落定

  const count = () => chat.locator('#session-list .session-item').count()
  const activeTitle = () =>
    chat.locator('#session-list .session-item.is-active .session-title').first().textContent()

  // 1) 左侧栏存在
  check('A1 左侧会话栏渲染出来(#session-list + ＋按钮)', (await chat.locator('#btn-new-session').count()) === 1)

  // 2) 窗口宽度 = 720（容纳侧栏）
  const bounds = await app.evaluate(({ BrowserWindow }) =>
    BrowserWindow.getAllWindows()
      .filter((w) => w.webContents.getURL().includes('chat'))
      .map((w) => w.getBounds())
  )
  check('窗口加宽到 720', bounds[0] && bounds[0].width === 720, `实际 ${bounds[0]?.width}`)

  // 3) 全新 userData → 恰好 1 个默认会话
  const c0 = await count()
  check('A0 全新启动只有 1 个默认会话', c0 === 1, `实际 ${c0}`)

  // 4) 新建会话 → 变 2 个，且新会话为活跃
  await chat.locator('#btn-new-session').click()
  await sleep(250)
  const c1 = await count()
  check('A2 点＋新建 → 会话数 +1', c1 === 2, `实际 ${c1}`)
  check('A2 新建后消息区为空', (await chat.locator('#msgs .msg').count()) === 0)

  // 5) 改名：双击活跃会话标题 → 出现输入框 → 填 → 回车 → 标题更新
  const firstTitle = chat.locator('#session-list .session-item .session-title').first()
  await firstTitle.dblclick()
  const rename = chat.locator('#session-list .session-rename').first()
  await rename.waitFor({ timeout: 3000 })
  await rename.fill('减肥计划')
  await rename.press('Enter')
  await sleep(250)
  const titles = await chat.locator('#session-list .session-title').allTextContents()
  check('A5 双击就地改名生效', titles.includes('减肥计划'), `实际 ${JSON.stringify(titles)}`)

  // 6) 设置/番茄钟 面板互斥(D3 老坑回归)
  await chat.locator('#btn-settings').click()
  await sleep(150)
  const settingsShown = !(await chat.locator('#settings').isHidden())
  const msgsHiddenWhenSettings = await chat.locator('#msgs').isHidden()
  check('B/D3 打开设置 → 设置显示且消息区隐藏', settingsShown && msgsHiddenWhenSettings)
  await chat.locator('#btn-pomo-open').click()
  await sleep(150)
  const pomoShown = !(await chat.locator('#pomodoro-panel').isHidden())
  const settingsHiddenWhenPomo = await chat.locator('#settings').isHidden()
  check('B/D3 切番茄钟 → 番茄显示且设置隐藏(两面板互斥)', pomoShown && settingsHiddenWhenPomo)
  await chat.locator('#btn-pomo-close').click()
  await sleep(150)
  check('回到对话视图 → 消息区可见', !(await chat.locator('#msgs').isHidden()))

  // 7) 切换会话：点另一个会话 → 它变活跃
  const items = chat.locator('#session-list .session-item')
  const n = await items.count()
  if (n >= 2) {
    const secondTitleText = (await items.nth(1).locator('.session-title').textContent()) ?? ''
    await items.nth(1).locator('.session-title').click()
    await sleep(250)
    const nowActive = (await activeTitle()) ?? ''
    check('A3 点会话切换 → 该会话变为活跃高亮', nowActive.trim() === secondTitleText.trim(), `期望 ${secondTitleText} 实得 ${nowActive}`)
  }

  // 8) 删除：× 两步确认 → 会话数 -1
  const before = await count()
  const firstItem = chat.locator('#session-list .session-item').first()
  await firstItem.hover()
  const del = firstItem.locator('.session-del')
  await del.click() // 第一下：变「删?」
  await sleep(120)
  const armedText = (await del.textContent()) ?? ''
  check('A6 删除第一下变「删?」(两步确认)', armedText.includes('删'), `实际 ${armedText}`)
  await del.click() // 第二下：真删
  await sleep(300)
  const after = await count()
  check('A6 第二下确认 → 会话数 -1', after === before - 1, `${before} → ${after}`)

  // 9) 删到只剩 1 个、再删 → 自动补 1 个（永远 ≥1）
  let guard = 0
  while ((await count()) > 1 && guard++ < 10) {
    const it = chat.locator('#session-list .session-item').first()
    await it.hover()
    const d = it.locator('.session-del')
    await d.click()
    await sleep(100)
    await d.click()
    await sleep(250)
  }
  const lastBefore = await count()
  const onlyItem = chat.locator('#session-list .session-item').first()
  await onlyItem.hover()
  const onlyDel = onlyItem.locator('.session-del')
  await onlyDel.click()
  await sleep(100)
  await onlyDel.click()
  await sleep(350)
  const lastAfter = await count()
  check('A8 删到只剩一个再删 → 自动补建(永远 ≥1)', lastBefore === 1 && lastAfter === 1, `${lastBefore} → ${lastAfter}`)

  // 10) 小白安全层：危险操作确认卡片渲染 + 响应（Path B Phase 2）
  await app.evaluate(({ BrowserWindow }) => {
    const w = BrowserWindow.getAllWindows().find((win) => win.webContents.getURL().includes('chat'))
    w?.webContents.send('tool:confirm', { id: 'e2e-1', title: '运行命令', detail: 'ls -la ~/Desktop' })
  })
  await sleep(300)
  check('安全确认卡片渲染(危险操作)', (await chat.locator('.confirm-card').count()) >= 1)
  const cardText = (await chat.locator('.confirm-card .confirm-detail').first().textContent()) ?? ''
  check('确认卡片显示将执行的内容', cardText.includes('ls -la'))
  await chat.locator('.confirm-card .btn-primary').first().click() // 点「允许」
  await sleep(200)
  const status = (await chat.locator('.confirm-card .confirm-status').first().textContent()) ?? ''
  check('点允许后显示已允许状态', status.includes('已允许'), `实际「${status}」`)

  // 11) 自更新（热升级）设置面板 UI（本程新增，真驱动 IPC→updater.ts 真跑 git）
  await chat.locator('#btn-settings').click()
  await sleep(200)
  check('F 更新框渲染（检查更新按钮存在）', (await chat.locator('#btn-check-update').count()) === 1)
  check('F「现在更新」按钮初始隐藏（没新版前不显示）', await chat.locator('#btn-apply-update').isHidden())
  check('F 启动自动检查开关存在', (await chat.locator('#chk-autocheck').count()) === 1)

  // 真点「检查更新」→ 走 update:check IPC → updater.ts 真在本仓库跑 git fetch+比对 → 状态栏出结果。
  // 断言「状态栏出现非空结果」即证明整条链路通（最新版/有新版/友好错误 任一都算接线成功）。
  await chat.locator('#btn-check-update').click()
  let updateStatusText = ''
  for (let i = 0; i < 80; i++) {
    updateStatusText = ((await chat.locator('#update-status').textContent()) ?? '').trim()
    if (updateStatusText.length > 0 && !updateStatusText.includes('正在看看')) break
    await sleep(250)
  }
  check(
    'F 点「检查更新」→ 真走 git → 状态栏出结果',
    updateStatusText.length > 0 && !updateStatusText.includes('正在看看'),
    `实际「${updateStatusText}」`
  )

  // 切「启动自动检查」开关 → 状态翻转（change 即存 config）
  const autoCheck = chat.locator('#chk-autocheck')
  const before11 = await autoCheck.isChecked()
  await autoCheck.click()
  await sleep(150)
  check('F 自动检查开关可切换', (await autoCheck.isChecked()) === !before11)

  // 展开模型设置 → 自启动开关存在、可切换、保存不崩
  const setup = chat.locator('#setup')
  if (!(await setup.evaluate((d) => d.open))) {
    await chat.locator('#setup > summary').click().catch(() => {})
    await sleep(150)
  }
  check('F 开机自启动开关存在', (await chat.locator('#chk-autolaunch').count()) === 1)
  const autoLaunch = chat.locator('#chk-autolaunch')
  const beforeAL = await autoLaunch.isChecked()
  await autoLaunch.click()
  await sleep(100)
  await chat.locator('#btn-save').click() // 触发 config.set(autoLaunch) + 主进程 applyLoginItem（失败静默降级，不应崩）
  await sleep(300)
  const saveAlive = (await chat.locator('#btn-check-update').count()) === 1 // 页面仍在=没崩
  check('F 切自启动+保存不崩溃', saveAlive && (await autoLaunch.isChecked()) === !beforeAL)
} catch (e) {
  bad('E2E 运行异常', e?.message ?? String(e))
} finally {
  await app.close()
  rmSync(userDataDir, { recursive: true, force: true })
  console.log(`\nE2E 结果：${pass} 通过 / ${fail} 失败`)
  process.exit(fail > 0 ? 1 : 0)
}
