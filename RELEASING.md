# 发布流程

每次发布产出一个 GitHub Release，正文直接来自 `CHANGELOG.md` 对应版本段落——更新日志与 Release 只有一处来源。

## 三步

1. **写日志**：在 `CHANGELOG.md` 顶部加一段 `## [X.Y.Z] — YYYY-MM-DD`，按「新增 / 变更 / 修复 / 文档」分组。
2. **改版本**：把 `package.json` 的 `version` 改成同一个版本号。
3. **跑脚本**：

```powershell
powershell -ExecutionPolicy Bypass -File scripts/release.ps1 -Version X.Y.Z
```

脚本依次做：

- 校验 `package.json` 版本与 `CHANGELOG.md` 段落一致、段落不为空
- 要求工作区干净（没提交就先提交）
- `build-patch.mjs --check`：确认 `cordis.patch.yml` 与 `src/` 源同步
- `check-bundle.cjs`：静态结构自检
- 若设置了 `DSH_RUNTIME`：宿主契约快照 + 三组真机 preset 验证（默认 / 子 preset 可见 / broken 子 preset 应可见）
- 打 `dist/*.tgz` 与 `dist/*.zip`
- 创建 annotated tag `vX.Y.Z`（已存在则复用）
- 有 `origin` 远程时推送 `main` + tag，并用日志段落创建/更新 GitHub Release；没有远程时只构建 + 本地打 tag，并打印后续命令

先看效果：

```powershell
powershell -ExecutionPolicy Bypass -File scripts/release.ps1 -Version X.Y.Z -DryRun
```

`-DryRun` 不推送、不建 Release，只打印脚本会发出的正文。

## 真机验证需要宿主运行时

`scripts/check-host-contract.mjs` 和 `scripts/verify-preset.mjs` 需要一个**解包的 DSH 运行时**（含 `node_modules/@deepseek-ai/dsh/lib/bin.js`）。从桌面版 `resources/app.asar` 解包后设置环境变量即可：

```powershell
$env:DSH_RUNTIME = "C:\path\to\extracted-dsh-runtime"
```

未设置时，发布脚本会跳过这些检查并打印 `SKIP`。建议每次发布都设置。

## 署名

**提交人固定是 DeepSeek**，不是仓库所有者。仓库本地的 git 身份已经设好：

```bash
git config user.name  "DeepSeek"
git config user.email "noreply@deepseek.com"
```

Release 正文只由日志段落组成，不加额外的署名行。

## 版本号怎么定

- **主版本**：破坏性变更（老版本 DSH 装不上、配置字段被删、行为语义变了）
- **次版本**：新增能力（新技能、新契约、新工具）
- **修订号**：修 bug、文档、内部整理

## 手动兜底

脚本某一步失败、又想单独发 Release 时：

```bash
gh release create vX.Y.Z --title vX.Y.Z --notes-file release-notes.md
```

正文同样从 `CHANGELOG.md` 抄，别另写一份。
