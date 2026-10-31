# 更新日志

版本号遵循语义化版本：破坏性变更升主版本，新增能力升次版本，修复升修订号。

## [2.0.0] — 2026-10-31

适配 DSH 0.2.1（实测宿主 0.2.1-rc.5）。**破坏性**：0.2.0 及更早的 DSH 装不上
（`dsh-tool-subagent` 的 `persona` / `toolFilter` 已被删除，子 agent 必须走
Agent Preset）。

### 新增

- **子级 preset `study-practice`**：练习员的人格与工具面从委派工具配置搬进独立
  Agent Preset，主 preset 用 `agentPreset: study-practice` 指过去。练习员的行为
  与工具面（read / read_image / glob / grep / web_search / web_fetch）保持不变。
- **结构级只读**：主 preset 与练习员 preset 的 `tool-fs` 都设
  `write: false` / `edit: false`——`write` / `edit` 工具根本不注册，不再靠人格
  规则约束。练习员同时没有 shell，也拿不到 `ask_user_question` 与委派工具。
- **上下文压缩**：补上压缩、`/compact` 命令和工具结果修剪。之前这个模式不会压缩，
  长练习会话会一路涨到装不下。
- **花名册补丁**（`plugin/hide-internal-presets.js`）：DSH 的 preset 注册表没有
  "隐藏"概念，练习员会像普通模式一样出现在选择器里；这个插件只包装 Web 花名册
  方法，注册表本身不动，委派仍能解析到子 preset。
- **`engines.dsh`**：声明 `>=0.2.1-rc.2`，由宿主在安装/启动时校验。
- **自检脚本重写**：`scripts/check-bundle.cjs` 不再依赖外部 YAML 包与硬编码路径，
  覆盖 preset 引用、已删除字段、结构只读、技能目录解析、花名册隐藏等断言。

### 工程化

- **源与生成物分离**：两段 persona 搬到 `src/persona.md` / `src/practice-persona.md`，
  组合结构进 `src/cordis.patch.template.yml`，`cordis.patch.yml` 由
  `scripts/build-patch.mjs` 生成；`--check` 纳入自检，防止生成物与源不同步。
- **花名册补丁只隐藏健康的内部 preset**：子 preset 加载失败时保留红卡与错误原文，
  不再"静默消失、只能翻宿主日志"。
- **宿主契约快照**：新增 `scripts/check-host-contract.mjs`，把本插件依赖的宿主 API
  表面（`tool-subagent` 字段、`tool-fs` 四个开关、花名册 remote、preset broken
  诊断、base 的 subagent 运行时等）读成快照；宿主升级后先跑它。
- **真机验证入仓**：新增 `scripts/verify-preset.mjs`，在隔离 `DSH_HOME` 里启动真实
  0.2.1-rc.x 宿主，调用 UI 同款 `agentPresets/list`；三种模式覆盖「主 preset 正常」、
  「子 preset 可见且正常」、「broken 子 preset 必须可见」。
- **发布流程**：新增 `RELEASING.md` 与 `scripts/release.ps1`（版本/日志校验 →
  全部检查 → 打包 → annotated tag → GitHub Release；无远程时只本地构建 + 打 tag）。
- **仓库规范**：`.gitattributes` 统一 LF、`dist/` 不入库、SHA256 sidecar 改为 LF
  行尾（`sha256sum -c` 可直接校验）。
- `check-bundle.cjs` 的自检项从九类扩到十类（加入生成物同步断言）。

### 变更

- 删除 `subagent-realm` isolate 组：宿主根已经提供 `subagents` 服务与 `spawn`
  provider，preset 再挂运行时要么被服务泄漏审计拒绝，要么把练习员与控制工具拆到
  两个 runtime，`send_message(agent_id)` 就找不到刚创建的子 agent。
- 委派工具配置只保留 `provider` / `toolName` / `agentPreset`；
  `backgroundMode` / `enableRunInBackground` 等字段随宿主删除。spawn 后端自带
  continuable 能力，每次调用仍返回 `started subagent <childId>`。
- 智能体团队插件不再需要关闭：0.2.1 起 preset 作用域内的同名工具会覆盖全局版本，
  `send_message` 的参数是 `agent_id`（团队版是 `target`）。
- `package.json` 的 `files[]` 增加 `plugin/` 与 `CHANGELOG.md`。

### 修复

- 「模式选择器里显示红色『加载失败』」——`tool-subagent` 的 `persona` / `toolFilter`
  在 0.2.1 被移除，整份 preset 挂载失败。迁移到 Agent Preset 后恢复正常。
- 技能目录解析在包名不匹配时抛可读错误，而不是静默得到空技能目录。

### 文档

- `README.zh.md` / `README.md` / `INSTALL.zh.md` 同步 0.2.1 的工具面、安装前置、
  团队插件与排查说明；`skills/study-practice-subagent/SKILL.md` 更新派活规程与
  故障排查表。

## [1.0.0] — 2026-09-30

首个版本：一个只反问、按 L0–L3 提示阶梯逐步放开的学习教练模式；七个按需加载的
技能；无 shell 的工具面；一个只读的 `subagent_practice` 练习员；结构自检与打包脚本。
