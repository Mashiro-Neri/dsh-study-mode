# 学习模式

给 DSH（DeepSeek Harness）加一个"陪你自己做题"的模式。

> **只想装上用？** 直接看 [安装指南](INSTALL.zh.md)：三种安装方式、装完怎么确认、出问题怎么查。

## 为什么写这个

把作业丢给 AI，它三秒钟给你一份可以原样交上去的答案。这个过程里你什么都没学到——你只是把不会做的题从"不会"变成了"暂时看起来会了"。

这份提示词的思路正相反：**默认只反问，不给答案**。卡住了才逐级给线索，最高一级给的是"留空的骨架"而不是成品。真想要完整答案也有一个明确的出口，但那要你自己说出口。

改成 DSH 模式之后，还多了一层约束：这个模式**没有 shell，也没有 `write` / `edit` 工具**。搭项目骨架、装依赖、代跑代码、写文件这些事，它在物理上就做不到，不是靠提示词"请勿代写"。

## 它是什么

两条 agent preset，由组合包的补丁（`cordis.patch.yml`）声明：主模式「学习模式」，以及它内部委派用的练习员 `study-practice`。身份、工具面、子代理都在会话创建时组装好；练习员不出现在模式选择器里。

默认使用者是**做学科作业的学生**：数学、物理、化学等题目走「逐步引导」——拆步，一次只推进一步；编程题按原有流程。

**提示词分三层落地**：

| 层 | 内容 | 生效方式 |
|---|---|---|
| 常驻身份层 | 身份、优先级、底线条款、级别标记、固定流程、阶梯分级、绝不允许、施压应对、退出开关、发送前自检 | persona，**每个请求都在场**，约 4200 字 |
| 按需细则层 | 七个技能：阶梯细则、概念讲解、调试引导、复盘与进度、练习员规程、学科（逐步引导+数理化）、写作 | 用到才由模型加载 |
| 结构约束层 | 工具面：**没有 shell，也没有 `write` / `edit`**；练习员另外没有 `ask_user_question`、没有委派工具 | 会话创建时定型 |

## 级别与阶梯

每条回复开头标注当前级别，形如 `[L1]`。每换一道新题回到 L0。

- **L0**（默认）：只反问，不给任何实质线索。
- **L1**：给方向——涉及哪个知识点、该往哪想。
- **L2**：给关键线索——具体函数/环节/公式，或该查的 API 名、关键字、文档位置。
- **L3**（最高）：留空骨架。留空的必须是这道题真正的决策点，整段**不能直接运行**。

升格只由使用者主动要求触发（「卡住了」「再提示一点」）。同题反复追问不自动升格，阶梯最高止于 L3。

唯一的放行口是【退出学习模式】：明确说出来、确认一次之后，给你完整答案，且只放行这一道题。

如果是被要求独立完成的考核或随堂测，上限压到 L2，且不提供退出开关。

## 学科题：逐步引导（2.1 新增）

数学、物理、化学、生物这类作业，默认**不是**把整题思路讲一遍，而是拆成步骤、**一次只推进一步**：

> 你：这题要求什么？你觉得第一步该先做什么？
> 他：求加速度……先受力分析？
> 你：对，先受力分析。这一步你打算画哪些力、以谁为对象？
> 他：（说出对象与力）
> 你：对象选对了。少了一个力——检查一下这个物体和周围还有哪些接触。
> 你：这一步过了。下一步该做什么？

规则：他做一步、你判一步，通过了再问下一步；某一步卡住才用 L0–L3，而且提示只作用于**当前这一步**。整题思路只在两个地方出现：你说了【退出学习模式】，或走【示范通道】（异题、同技法、中性命名的小示范 + 淡出练习，严禁覆盖原题）。

清单里每条会带**微目标**（这题在练什么）、**当前步骤**、**级别**和**卡点类型**，长会话压缩后也能接上；全部做完的小结会给"卡点类型分布"。

## 练习契约

一次给多道题时，它会用 `todo_write` 立一份**今日练习清单**：题号 + 一句话题干 + 状态，问你想从哪道开始，然后一次只推进一道。每道做完，它问你"卡在哪、现在觉得哪里通了"，把你的话压成几个字记在那一条后面。全部完成后问你要不要小结（哪几道顺、卡点集中在哪一类环节）。

三个刻意的设定：

- **清单里绝不出现答案、关键线索或成品代码**——清单是你看得见的，写进去等于泄题；卡点只记现象（"边界漏了"），不记解法。
- **没有任何自动推进机制。** 它不是 goal，也不会在你没回复时自己往前跑；每道题都在你回复之后才开始。
- **清单不跨会话。** 关掉就没了，下次要重立——它不会假装记得上次的事。

## 装了些什么

一个模式（外加一个只在内部使用、不占模式列表的练习员 preset）：

- 常驻的规则说明（约 4200 字/请求）
- 工具面：`read` / `read_image` / `glob` / `grep` / `web_search` / `web_fetch` / `ask_user_question` / `skill` / `todo_write` + 子代理控制工具（`send_message` / `interrupt_agent` / `list_agents`）
- **没有** `pwsh` / `bash` / `jobs`，**也没有** `write` / `edit`
- 一个只读的练习员子代理（独立 preset，被花名册补丁从模式选择器里隐藏）
- 学科逐步引导协议：拆步、一次一步、卡点类型映射、示范通道
- 上下文压缩：长练习会话不会一路涨到装不下

七个技能随包分发，通过 `skill-filesystem` 的 `customSkillDirs` 发现，路径在加载时从本包位置解析：

| 技能 | 作用 |
|---|---|
| `study-hint-ladder` | L0–L3 每级到底能给什么、骨架怎么留空、什么算越界、升格降格条件、卡点类型 → 提示形态映射 |
| `study-concept-coaching` | 概念题怎么直接讲透、讲完怎么用 1-2 个小问题验证真懂了、怎么不泄露他手上的题 |
| `study-debug-coaching` | 编程题的调试三连问、带他自己读报错、代码评审只指问题不代改 |
| `study-review-checklist` | 什么时候才该复盘、复盘说多少、练习契约（清单怎么立、状态与卡点类型怎么记）、换题复位 |
| `study-practice-subagent` | 练习员什么时候派、派活消息怎么写、变体质量门、时序限制、"产物不得覆盖原题"怎么执行 |
| **`study-subject`** | **学科题逐步引导与推理：拆步、一次只推进一步、留空推导链、五类高频错误、反例思维** |
| `study-subject-writing` | 作文与文本类："一个完整句子都不能给"这条硬边界、按"主张—结构—论据"拆解、写作版 L3 提纲 |

后面的学科技能只替换"线索和骨架长什么样"，不覆盖底线与流程。加新科目就是往 `skills/` 里加一个目录，不用动 preset。

## 练习员（子代理）

`subagent_practice`，只读：`read` / `read_image` / `glob` / `grep` / `web_search` / `web_fetch`。没有 shell，没有 `write` / `edit`。

这个只读是**结构保证**：练习员是独立的 agent preset（`study-practice`），它的工具行只挂出上面这六个工具。`write` / `edit` 在工具面里根本不存在，`ask_user_question`（它不能向你提问）和任何委派工具也都没有。

四类活：**出同知识点的变体题**、**独立核对**学习者的答案（给"错在哪一类环节"+判据，不给改法）、**补充反例**、**核实官方文档**（带链接与原文片段）。

它的铁律写在自己的人格和派活规程里：**不得解出使用者手上那道题，不得产出可直接提交的成品**。派活的任务如果真的违规，它应当拒绝并给出替代产出。

每次调用 `subagent_practice` 都立即返回 `started subagent <childId>`（0.2.1 起总是异步启动，没有 `run_in_background` 参数）；之后用 `send_message(agent_id: ...)` 反复派活，背景只讲一次。

练习员这个 preset 不出现在模式选择器里（花名册补丁只过滤**健康的**内部 preset）。如果它自己加载失败，会以红卡形式出现在模式列表里，错误原文可见，同时也写进宿主日志 `agent preset study-practice:`——所以改完结构记得先跑一遍自检和真机验证。

## 安装

需要 DSH **0.2.1-rc.2 或更新**（`package.json` 声明了 `engines.dsh`，更老的宿主加载不了 preset 模型）。三种方式、装完怎么确认、出问题怎么查，都写在 **[INSTALL.zh.md](INSTALL.zh.md)**。最省事的一种：

```
# 新开一个标准模式会话，把这句话发给它
把 C:\Users\li_jie\.dsh\dsh-local-bundles\dsh-study-mode\dist\dsh-community-dsh-study-mode-2.0.0.tgz 作为插件组合包装到当前 profile
```

它会调用 `plugin_manager` 的 `install_bundle` 走完 pnpm 安装 → 写入 `dsh.profile.bundles` → 应用 patch。装完**完整重启一次 DSH**（新增 preset 行需要重启；profile 的 patch 层是 live 的，但 preset 花名册不是）。

重启后在 设置 →「模式」应能看到「学习模式」卡片，新建会话时可在欢迎页选择。模式列表里只多出这一张——内部的练习员 preset 被花名册补丁隐藏了。模式在会话创建时定型，中途改不了。

## 分发格式

打包产物在 `dist/`：

| 文件 | 说明 |
|---|---|
| `dsh-community-dsh-study-mode-2.0.0.tgz` | 可安装的 npm 包，可交给 `plugin_manager` 的 `install_bundle`，或用 `dsh plugin --profile <p> add <路径>` |
| `…tgz.sha256` | 上面那个包的 SHA256 校验值 |
| `dsh-study-mode-2.0.0.zip` | **整包压缩档**：源码树 + 上面那个 tgz，自包含，解压即得一个顶层文件夹 `dsh-study-mode-2.0.0/` |
| `…zip.sha256` | 上面那个 zip 的 SHA256 校验值 |

**两个产物的用途不同**：`.tgz` 是给 DSH 的 `plugin_manager` 吃的安装包；`.zip` 是给人看的整包——拿到就能读源码、看文档、直接跑打包脚本，不需要另外去 clone。zip 里的 tgz 校验值与它自带的 `.sha256` 一致。

zip 里共 32 个文件（口径：一次干净的重新打包——先 `build-package.ps1` 再 `build-zip.ps1`：仓库源码树 30 个文件 + `dist/` 里的 tgz 与它的 sha256；不含正在生成的 zip 本身，也不含 `.git` / `node_modules` 这类被排除项）：

```
dsh-study-mode-2.0.0/
├── src/                    源：persona Markdown + 组合模板
├── cordis.patch.yml        由 src/ 生成的组合补丁
├── package.json
├── plugin/                 花名册补丁（隐藏健康的练习员 preset）
├── skills/                 七个技能
├── docs/                   原始提示词 + 对照表
├── scripts/                生成、自检、契约快照、真机验证与打包脚本
├── dist/                   打包产物（tgz 及其校验值）
├── CHANGELOG.md / RELEASING.md
├── README.md / README.zh.md / INSTALL.zh.md / LICENSE
```

包名 `@dsh-community/dsh-study-mode`，声明了 `dsh.bundle.patch = ./cordis.patch.yml`，`files` 白名单只装必要内容：

```
package/cordis.patch.yml          preset 声明
package/plugin/hide-internal-presets.js  花名册补丁
package/skills/…/SKILL.md         七个技能
package/docs/source-prompt.zh.md  原始提示词（改动时可对照）
package/README.md, README.zh.md, INSTALL.zh.md, CHANGELOG.md, LICENSE
```

**技能路径解析已经做成两种安装布局都能用**：本地 link 时包名是 `@local/dsh-study-mode`，tgz / registry / git 安装时是 `@dsh-community/dsh-study-mode`。patch 里的 `!!js` 表达式按候选列表逐个 `try`，取第一个解析得到的；全都不匹配时**抛一个可读的错误**，而不是静默得到空技能目录。写死任一个都会让另一种布局静默失去全部技能——这正是你 requirements-mode 上踩过的那个坑。

**发布到 npm 或 GitHub 需要先把 `"private": true` 去掉**（现在保留着，是为了防止误发到一个还没有归属的社区 scope）。

## 已知的取舍与不足

**`write` / `edit` 现在是结构上没有的。** 主 preset 与练习员 preset 的 `tool-fs` 都设了 `write: false` / `edit: false`——这两个工具根本不会注册，不再是"挂着但被规则禁止"。这条约束对主教练同样生效：它不能替你写文件，只能读。

**shell 也一样，是真没了。** 没有 `pwsh` / `bash` / `jobs`，搭骨架、装依赖、代跑代码都做不到。

**练习员的只读由它自己的 agent preset 保证。** 它只有六个工具、没有 `ask_user_question`、没有继续委派的能力；它的人格与工具面写在自己的 preset 里，委派工具只负责指过去。

**练习员 preset 在选择器里看不见——除非它坏了。** 花名册补丁只过滤健康的内部 preset；子 preset 加载失败时它会以红卡形式出现，错误原文可见（同时也会写进宿主日志 `agent preset study-practice:`）。改完结构先跑 `node scripts/check-bundle.cjs` 和真机验证能提前拦下大部分问题。

**练习员看不到你和教练的对话**，所以每次派活都要把背景重讲一遍。好处是它不会瞎猜上下文。

**`send_message` 有时序限制**：练习员正在跑的时候投递不过去，会报 `subagent "<id>" is unavailable`。这不是出错，等它这一轮结束再发。

**常驻规则约 4200 字/请求**（2.1.1 从 6800 字压回 4200，规则语义不变）。取舍理由是底线与流程骨架必须一直在场，细则才按需加载。另外：技能目录每个会话只注入一次（名字 + 一行描述），技能正文按需整篇加载；2.1.1 把目录描述从合计 1028 字压到 308 字。

**「智能体团队」插件不用再关了。** 0.2.1 起 preset 作用域里注册的同名工具会覆盖全局版本：本模式的 `send_message` 参数是 `agent_id`，团队版是 `target`，看参数名就能分清。

## 自己改

persona 与组合结构**不是手改 `cordis.patch.yml`**：`src/persona.md`、`src/practice-persona.md` 和 `src/cordis.patch.template.yml` 是源，`cordis.patch.yml` 由脚本生成。改人格改 Markdown，改工具面改模板，然后重新生成。

```powershell
# 改完 src/ 后重新生成 cordis.patch.yml
node scripts/build-patch.mjs

# 静态自检（会顺带跑 build-patch --check，确认生成物与源同步）
node scripts/check-bundle.cjs

# 宿主契约快照（宿主升级后先跑它；需要解包的 0.2.1-rc.x 运行时）
node scripts/check-host-contract.mjs --runtime <运行时目录>

# 真机 preset 验证；三种模式：默认 / 子 preset 可见 / broken 子 preset 应可见
node scripts/verify-preset.mjs --runtime <运行时目录>
node scripts/verify-preset.mjs --runtime <运行时目录> --with-internal
node scripts/verify-preset.mjs --runtime <运行时目录> --broken-internal

# 打包（build-package 会先跑自检；zip 会包含 tgz）
powershell -ExecutionPolicy Bypass -File scripts/build-package.ps1
powershell -ExecutionPolicy Bypass -File scripts/build-zip.ps1

# 发布：校验版本与日志 → 全部检查 → 打包 → tag → GitHub Release
powershell -ExecutionPolicy Bypass -File scripts/release.ps1 -Version 2.0.0
```

`check-bundle.cjs` 检查十一类事：两个 preset 是否存在且子级先于主级声明；委派行是否指向 `study-practice`、是否还残留宿主 0.2.1 已删除的旧字段；有没有混进自挂的子 agent 运行时或 shell 行；两个 `tool-fs` 行是否都关掉了 `write` / `edit`；练习员的工具面是否恰好只有它该有的那几行；主 persona 的行为标记与技能路由是否齐全；每个技能的 frontmatter 是否合法、`customSkillDirs` 的候选包名**至少有一个能从 profile 解析出真实存在的 `skills/` 目录**（解析不到就抛错）；花名册补丁是否存在并列出练习员；**`cordis.patch.yml` 是否与 `src/` 源同步**；**教学契约**（"考核不盘问""学科逐步引导""示范通道""卡点类型""微目标"等承诺是否还在 persona/技能里）；`package.json` 的 `files` 白名单是否齐全。它不依赖外部 YAML 包，也不需要先装依赖。

技能目录那一条尤其值得跑：包名写错时 preset 照样"加载成功"，但技能目录**静默为空**，只有真正调用 `skill` 时才报"unknown or no longer available"。现在解析失败会直接抛错，问题提前暴露在 preset 加载阶段。

宿主升级后先跑 `check-host-contract.mjs`：它把本插件依赖的宿主契约（`tool-subagent` 的 Config 字段、`tool-fs` 的四个开关、花名册 remote、preset broken 诊断等）读成快照，宿主一变就先失败，而不是等用户看到红卡。

改完之后，结构变化需要重启 DSH 生效；技能正文是改完就热加载的。发布流程见 [RELEASING.md](RELEASING.md)。

## 目录结构

```
.
├── package.json            声明这是个 DSH 组合包（@dsh-community/dsh-study-mode）
├── src/                    源：persona Markdown + 组合模板
│   ├── persona.md          主 preset 的常驻人格（约 5200 字）
│   ├── practice-persona.md 练习员 preset 的人格
│   └── cordis.patch.template.yml  两个 preset + 花名册补丁的模板
├── cordis.patch.yml        由 src/ 生成的组合补丁（勿手改）
├── plugin/
│   └── hide-internal-presets.js  把健康的练习员 preset 从模式选择器里过滤掉
├── CHANGELOG.md            更新日志
├── RELEASING.md            发布流程
├── skills/                 七个技能
│   ├── study-concept-coaching/
│   ├── study-debug-coaching/
│   ├── study-hint-ladder/
│   ├── study-practice-subagent/
│   ├── study-review-checklist/
│   ├── study-subject/
│   └── study-subject-writing/
├── docs/
│   ├── source-prompt.zh.md 原始提示词，以及与 persona/技能的对照表
│   └── README.md
├── scripts/
│   ├── build-patch.mjs     由 src/ 生成 cordis.patch.yml（--check 校验同步）
│   ├── check-bundle.cjs    结构自检（打包前会自动跑）
│   ├── check-host-contract.mjs  宿主契约快照（宿主升级后先跑）
│   ├── verify-preset.mjs   真机 preset 验证（三种模式）
│   ├── build-package.ps1   打成 dist/*.tgz（可安装的 npm 包）
│   ├── build-zip.ps1       打成 dist/*.zip（整包压缩档）
│   └── release.ps1         发布：检查 + 打包 + tag + GitHub Release
├── dist/                   打包产物（不入库；不进 tgz，但进 zip）
├── README.md               英文
├── README.zh.md            中文（本文件）
├── INSTALL.zh.md           安装指南
└── LICENSE
```

## License

MIT
