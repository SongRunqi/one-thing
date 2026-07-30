# Evals Triage Ledger (Phase 4)

Weekly diagnosis artifact. Updated by script or manually from `records.jsonl` low-score aggregation.

## Current Week: 2026-07-29

| 失败类别 | 本周 | 累计 | 归因段落 | 状态 |
|---|---|---|---|---|
| _(populated by diagnosis)_ | | | | |

## Historical

### 2026-W27 (Jul 7-13, baseline)

- No data yet. First records will appear after Phase 1 collects signals.

## Categories Legend

| Category | Prompt Section | Description |
| --- | --- | --- |
| missed-directory-switch | Known Projects | Didn't switch to project dir before operating |
| ignored-skill-instructions | Skills | Didn't read SKILL.md when task matched |
| voice-mode-violation | Voice | Used code blocks/long output in voice mode |
| ignored-known-projects | Known Projects | Ignored known project context |
| wrong-platform-behavior | OS section | Wrong OS syntax (Unix on Windows etc.) |
| ignored-agent-instructions | Agent | Ignored custom agent system prompt |
| general-poor-response | Core | Generally poor but not attributable |
| not-prompt-fault | N/A | Not a prompt issue (model/tool limitation) |

## Process

1. Run diagnosis script: `node scripts/diagnose-weekly.mjs`
2. Review and correct categorization
3. Pick one category → form hypothesis → update experiments.md → test


## 2026-07-08 (auto-generated draft)

Total turns this period: 4
Turns with negative signals: 0

| 失败类别 | 本周 | 归因段落 | 状态 |
|---|---|---|---|
| _(no failures detected)_ | 0 | — | — |

<!-- Auto-generated. Review and correct before committing. -->


## 2026-07-08 (auto-generated draft)

Total turns this period: 4
Turns with negative signals: 0

| 失败类别 | 本周 | 归因段落 | 状态 |
|---|---|---|---|
| _(no failures detected)_ | 0 | — | — |

<!-- Auto-generated. Review and correct before committing. -->


## 2026-07-09 (auto-generated draft)

Total turns this period: 8
Turns with negative signals: 1

| 失败类别 | 本周 | 归因段落 | 段版本分布 | 状态 |
|---|---|---|---|---|
| general-poor-response | 1 | system | 8473e9a5 ×1 | 待修 |

<!-- Auto-generated. Review and correct before committing. -->


## 2026-07-09 (auto-generated draft)

Total turns this period: 16
Turns with negative signals: 3

| 失败类别 | 本周 | 归因段落 | 段版本分布 | 状态 |
|---|---|---|---|---|
| general-poor-response | 2 | system | 8473e9a5 ×2 | 待修 |
| not-prompt-fault | 1 | N/A | — | 待修 |

<!-- Auto-generated. Review and correct before committing. -->


## 2026-07-09 (auto-generated draft)

Total turns this period: 16
Turns with negative signals: 3

| 失败类别 | 本周 | 归因段落 | 段版本分布 | 状态 |
|---|---|---|---|---|
| general-poor-response | 2 | system | 8473e9a5 ×2 | 待修 |
| not-prompt-fault | 1 | N/A | — | 待修 |

<!-- Auto-generated. Review and correct before committing. -->


## 2026-07-10 (auto-generated draft)

Total turns this period: 78
Turns with negative signals: 22

| 失败类别 | 本周 | 归因段落 | 段版本分布 | 状态 |
|---|---|---|---|---|
| general-poor-response | 15 | system | 8473e9a5 ×9, 19c5d76c ×6 | 待修 |
| not-prompt-fault | 7 | N/A | — | 待修 |

<!-- Auto-generated. Review and correct before committing. -->

### 事故聚类(incident workbench)

| 类别 | 数量 | 诊断结论 | 事故 |
|---|---|---|---|
| (未分析) | 7 | — | `2026-07-10-01cefc75` `2026-07-10-2a754de0` `2026-07-10-bb9ac073` … |


## 2026-07-29 (auto-generated draft)

Total turns this period: 241
Turns with negative signals: 24

| 失败类别 | 本周 | 归因段落 | 段版本分布 | 状态 |
|---|---|---|---|---|
| general-poor-response | 23 | system | ca9f110b ×9, a7180188 ×4, f89eef1f ×3, f29ca7cf ×2, b03e20a4 ×2, f2719148 ×2, a11b8097 ×1 | 待修 |
| not-prompt-fault | 1 | N/A | — | 待修 |

<!-- Auto-generated. Review and correct before committing. -->
