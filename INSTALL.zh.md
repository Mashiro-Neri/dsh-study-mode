# 安装指南

给 DSH（DeepSeek Harness）装「学习模式」。装完的结果是：设置 →「模式」里多一张「学习模式」卡片，新建会话时可以选它。（只多这一张——内部的练习员 preset 被花名册补丁隐藏，不会出现在模式列表里。）

包名：`@dsh-community/dsh-study-mode` ｜ 版本：`2.1.0`

---

## 前置条件

- DSH **0.2.1-rc.2 或更新**（本包在 `0.2.1-rc.5` 上验证；`package.json` 声明了 `engines.dsh`，更老的宿主没有 preset 模型，装上也加载不了）
- 「智能体团队」插件**不需要关闭**：0.2.1 起 preset 作用域里的同名工具会覆盖全局版，本模式的 `send_message` 参数是 `agent_id`（团队版是 `target`），看参数名就能分清
- 安装需要 **Full access** 权限或允许审批

---

## 方式一：让 DSH 自己装（推荐）

新开一个**标准模式**的会话，把这段话发给它：

```
把 <本包路径> 作为插件组合包装到当前 profile，装完告诉我它加了哪些 preset 和技能。
```

把 `<本包路径>` 换成下面任一种：

| 你手上有什么 | 填什么 |
|---|---|
| 源码目录 | `C:\Users\li_jie\.dsh\dsh-local-bundles\dsh-study-mode` |
| 打包好的 tgz | `C:\Users\li_jie\.dsh\dsh-local-bundles\dsh-study-mode\dist\dsh-community-dsh-study-mode-2.1.0.tgz` |
| 已推到 GitHub 的仓库 | `https://github.com/<你的用户名>/dsh-study-mode` |

它会调用 `plugin_manager` 的 `install_bundle`，自动完成：pnpm 安装 → 写入 profile 的 `dsh.profile.bundles` → 应用 bundle patch。

**装完必须完整重启一次 DSH。** 新增的 preset 行要重启才进花名册。

---

## 方式二：命令行

```bash
# 从本地路径或 tgz
dsh plugin --profile desktop add "C:/Users/li_jie/.dsh/dsh-local-bundles/dsh-study-mode/dist/dsh-community-dsh-study-mode-2.1.0.tgz"

# 或从 GitHub
dsh plugin --profile desktop add github:<你的用户名>/dsh-study-mode
```

`desktop` 换成你自己的 profile 名。装完同样要完整重启。

---

## 方式三：手工注册（不走 plugin-manager 时）

适合你只想用本地源码目录、不想让 pnpm 碰网络的情况：

1. **把包链接进 profile 的 `node_modules`**

   ```powershell
   $profile = "C:\Users\li_jie\.dsh\profiles\desktop"
   $scopeDir = Join-Path $profile "node_modules\@dsh-community"
   New-Item -ItemType Directory -Path $scopeDir -Force | Out-Null
   New-Item -ItemType Junction -Path (Join-Path $scopeDir "dsh-study-mode") `
            -Target "C:\Users\li_jie\.dsh\dsh-local-bundles\dsh-study-mode"
   ```

2. **在 `<profile>\package.json` 里登记两处**

   ```json
   {
     "dsh": {
       "profile": {
         "bundles": [
           "@deepseek-ai/dsh-base",
           "@deepseek-ai/dsh-web-app",
           "@dsh-community/dsh-study-mode"
         ]
       }
     },
     "dependencies": {
       "@dsh-community/dsh-study-mode": "link:C:/Users/li_jie/.dsh/dsh-local-bundles/dsh-study-mode"
     }
   }
   ```

   注意 `bundles` 的顺序就是补丁层顺序，「学习模式」要排在 `dsh-base` 和 `dsh-web-app` **之后**，否则它会拿不到内置的 `persona`、`tools`、`skill` 等行。

3. **完整重启 DSH。**

---

## 装好之后怎么确认

1. 设置 →「模式」，应能看到**「学习模式」**卡片，卡片上没有红色「加载失败」标记。模式列表里**只多出这一张**——内部的练习员 preset 被花名册补丁隐藏了，不会出现在选择器里。
2. 新建会话，在欢迎页的模式选择里选「学习模式」。
   **必须在发第一条消息之前选**——会话的模式在创建时定型，中途改不了。
3. 发一道**学科题**试试，比如 `解方程 x²-5x+6=0`。应该看到它先拆步、一次只问一步（"这题要求什么？你打算先做哪一步？"），**不直接给解**。
4. 也可以发一句 `什么是递归？`：概念题直接讲，回复以 `[概念]` 开头。

想让它成为新会话默认模式，在 设置 →「模式」里设默认。做学科作业或刷题时用它；平时主要写代码、跑命令的话建议还是留在标准模式。

---

## 它会带来什么

**一个模式**（preset id `study`，显示名「学习模式」，排序 5），外加一个只在内部使用、不占模式列表的练习员 preset（`study-practice`，排序 51，被花名册补丁隐藏）：

- 常驻规则约 4200 字/请求（身份、底线条款、L0–L3 阶梯、学科逐步引导、示范通道、固定流程、练习契约、发送前自检）
- 工具面：`read` / `read_image` / `glob` / `grep` / `web_search` / `web_fetch` / `ask_user_question` / `skill` / `todo_write` + 子代理控制工具（`send_message` / `interrupt_agent` / `list_agents`）
- **没有 `pwsh` / `bash` / `jobs`，也没有 `write` / `edit`**——搭骨架、装依赖、代跑代码、写文件在物理上做不到（`tool-fs` 的 `write` / `edit` 开关是关掉的，工具根本不注册）
- 一个只读的练习员子代理 `subagent_practice`：只有上面那六个读类工具，没有 `ask_user_question`、没有委派工具
- 学科题默认逐步引导：拆步、一次只推进一步，他做一步你判一步；卡点类型决定提示形态
- 上下文压缩（`/compact` 与工具结果修剪），长练习会话不会一路涨到装不下

**八个技能**随包分发：

`study-hint-ladder`（阶梯与卡点类型映射）、`study-concept-coaching`（概念讲解）、`study-debug-coaching`（编程调试引导）、`study-review-checklist`（复盘与练习契约）、`study-practice-subagent`（练习员规程与质量门）、`study-subject-stepwise`（学科逐步引导协议）、`study-subject-math`（数理化推理）、`study-subject-writing`（写作类）

---

## 卸载

```
plugin_manager
  action: remove_bundle
  target: @dsh-community/dsh-study-mode
```

八个技能和两个 preset（含隐藏的练习员）跟着一起移除，不用另外清理。手工安装的话，把 `<profile>\package.json` 里那两处条目删掉、重启即可。

---

## 遇到问题

先跑自检，不用装依赖、几秒钟：

```bash
node scripts/check-bundle.cjs
```

大部分结构问题（preset 引用、已删除的旧字段、结构只读被改回去、技能目录、花名册隐藏、包清单）会在重启前被它拦下。

### 模式列表里没有「学习模式」

模式列表**只显示能正常加载的模式**，加载失败会静默消失，不会有任何提示。

去 设置 →「模式」页看那张卡片。如果卡片是红的、带「加载失败」标记，鼠标悬停上去能看到真正的原因。**这是 UI 上唯一能看到错误信息的地方**；内部练习员 preset 坏了也会以红卡形式出现在这里（花名册补丁只隐藏健康的内部 preset）。

常见原因：

| 现象 | 原因 |
|---|---|
| `tool-subagent: ... is no longer supported` | 委派工具里还在配 `persona` 这类 0.2.1 已删字段——说明 patch 被改回了旧写法，或装的是旧版本的包 |
| `Preset services require isolate realms: ...` | preset 里自挂了会提供 service 的行（本包不该再挂子 agent 运行时或 shell 执行器）；对照 `cordis.patch.yml` 的现写法恢复 |
| `Cannot find module '@deepseek-ai/dsh-...'` | 宿主版本与 preset 里的插件行对不上：先确认 DSH ≥ 0.2.1-rc.2，且装的是 2.1.0 的包 |
| 卡片正常但 `skill` 调用报 `unknown or no longer available` | 技能目录没解析出来，见下一条 |

### 练习员的错误看不到（隐藏 preset）

练习员是独立的子级 preset（`study-practice`），花名册补丁只隐藏**健康**的内部 preset：它加载失败时会在模式列表里显示红卡、带错误原文；同时宿主日志里会有 `agent preset study-practice:` 一行。改完结构先跑 `node scripts/check-bundle.cjs` 通常能提前发现。

### 技能加载不出来

`customSkillDirs` 的路径是按**包名**从 profile 解析的，而同一个包在不同安装布局下名字不同（本地 link 时是 `@local/dsh-study-mode`，tgz/registry/git 安装时是 `@dsh-community/dsh-study-mode`）。patch 里已经按候选列表逐个尝试，两种布局都能命中；两个都不匹配时会**直接抛一个可读的错误**，不会再静默得到空技能目录。

如果你**改了包名**或用了别的安装方式，导致两个候选都不匹配，先跑上面的自检——它会解析候选包名、确认 `skills/` 真的存在，并把不匹配的原因打出来。

### 子代理创建不出来

先确认当前会话确实是「学习模式」（看会话上方的模式标识）。然后看 `send_message` 的参数是 `agent_id` 还是 `target`：`agent_id` 是本模式的；`target` 是团队版。0.2.1 起 preset 作用域会覆盖全局同名工具，正常情况下拿不到团队版，所以出现 `target` 反而说明本模式的控件行没加载——跑自检并看宿主日志。

每次调用 `subagent_practice` 都会立即返回 `started subagent <childId>`，结果随后作为完成通知到达；之后用 `send_message(agent_id: ...)` 续聊。如果创建失败，真正的报错在会话日志/宿主日志里，先用 `node scripts/check-bundle.cjs` 排除结构问题。

### 安装时报 git 或 SSL 错误

从 GitHub 安装时按需拉取，本机 git 要能访问 GitHub：

```bash
# 报 Host key for github.com has changed
git config --global url."https://github.com/".insteadOf "ssh://git@github.com/"

# 报 SSL certificate problem: unable to get local issuer certificate
git config --global http.sslBackend schannel
```

---

## 自己改和重新打包

persona 与组合结构由 `src/` 生成，不要手改 `cordis.patch.yml`：

```powershell
# 改完 src/ 后重新生成 cordis.patch.yml
node scripts/build-patch.mjs

# 结构自检（preset、结构只读、技能、花名册隐藏、教学契约、包清单）
node scripts/check-bundle.cjs

# 打包成 dist/*.tgz + SHA256（会先跑上面的自检，并检查 plugin/ 是否存在）
powershell -ExecutionPolicy Bypass -File scripts/build-package.ps1

# 发布（含真机验证，需要 DSH_RUNTIME）
powershell -ExecutionPolicy Bypass -File scripts/release.ps1 -Version 2.1.0
```

改完之后：**结构变化**（preset 的插件行、persona、技能增删、花名册补丁）需要重启 DSH 生效；**技能正文**是改完就热加载的。宿主升级后先跑 `node scripts/check-host-contract.mjs --runtime <解包运行时>`。

---

## 版本与兼容

本包在 DSH `0.2.1-rc.5` 上验证，`package.json` 声明 `engines.dsh >= 0.2.1-rc.2`：

- 0.2.0 及更早的 DSH **装不上也加载不了**——那些版本还要求把 `persona` 写在委派工具里，而 0.2.1 把这个字段删了，改成 Agent Preset 模型。
- preset 里的 `@deepseek-ai/dsh-*` 插件行由宿主安装的运行时解析，包本身没有需要同步改版本号的 peer 依赖。
- 升级 DSH 之后，建议先跑一次 `node scripts/check-bundle.cjs`，再新建会话确认模式能加载。
