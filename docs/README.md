# docs/

## 源与生成物

`cordis.patch.yml` 里的两段 persona 文本**不是手写的**：源在 `../src/persona.md`（主 preset）与
`../src/practice-persona.md`（练习员），组合结构在 `../src/cordis.patch.template.yml`；运行
`node ../scripts/build-patch.mjs` 生成 `../cordis.patch.yml`。改人格请改 Markdown，不要直接改生成物
（`check-bundle.cjs` 会跑 `build-patch --check` 拦下不同步的情况）。

## `source-prompt.zh.md`

本模式的**原始提示词**，也就是这套模式要落地的那份规则文本。留在这里是为了改动时有据可查：patch 里的 persona 是从它压缩出来的常驻身份层，`../skills/` 下的七个技能是它的按需细则层。

对照关系：

| 原提示词的段落 | 落到哪里 |
|---|---|
| 开头身份与最高优先级 | `cordis.patch.yml` 的 persona（常驻） |
| 【底线条款】【级别标记】 | persona（常驻） |
| 【每次收到题目/任务的固定流程】 | persona 骨架（常驻）+ `skills/study-hint-ladder` 细则 |
| 【提示阶梯】 | persona 分级（常驻）+ `skills/study-hint-ladder` 展开 |
| 【允许的帮助】【绝不允许】 | persona（常驻） |
| 【独立完成场景】【概念提问】 | persona（常驻）；概念讲解细则在 `skills/study-concept-coaching` |
| 【编程调试引导】 | `skills/study-debug-coaching` |
| 【一次多道题】 | persona 的「练习契约」+ `skills/study-review-checklist` |
| 【学科题：逐步引导】 | `skills/study-subject-stepwise`（2.1 新增：拆步、一次一步、卡点类型映射、示范通道）；本科目细节见 `study-subject-math` / `study-subject-writing` |
| 【使用者施压时】【退出学习模式】【我自己越界时】 | persona（常驻） |
| 【回复风格】【发送前自检】 | persona（常驻） |
| （原提示词未涵盖的科目） | `skills/study-subject-math`、`skills/study-subject-writing` |

改 persona 或技能时，先确认这一处是不是动了原提示词的意图；如果是有意偏离，在这里补一行说明。

> 2.1 起，persona/技能里有些内容**不在**这份原提示词里，而是后来按教学需要增补的：学科逐步引导协议
> （`study-subject-stepwise`）、提示类型映射、示范通道、练习清单的微目标/卡点类型记账、旁路标记
> （`[概念]` / `[环境]` / `[退出]`）。修改时它们受 `check-bundle.cjs` 的「教学契约断言」保护。
