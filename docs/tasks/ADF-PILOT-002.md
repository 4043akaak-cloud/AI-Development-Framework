# Task — ADF-PILOT-002: Phase 0向けGitHub運用記述を明確化する

> Type: Docs
> Status: Done
> Owner: Codex
> Review: Project Owner
> Related: [Goal](../project/GOAL.md) / [MVP](../project/MVP.md) / [Roadmap](../project/ROADMAP.md)

このTaskは、Codex単独パイロットで最初に数える可逆な文書Taskである。

## Objective

`docs/workflow/GITHUB_OPERATIONS.md`で、Phase 0では不要なGitHub Project、Feature Branch、PR、日次pushの運用を、現在必須の手順と誤認しないようにする。

## Required Context

### GitHub

- [AI Delegation Charter](../workflow/AI_DELEGATION_CHARTER.md)
- [Task Lifecycle](../workflow/TASK_LIFECYCLE.md)
- [Codex単独パイロット](../workflow/CODEX_SOLO_PILOT.md)
- [Experiment Protocol](../workflow/EXPERIMENT_PROTOCOL.md)
- [GitHub Operations](../workflow/GITHUB_OPERATIONS.md)
- [Current State](../project/CURRENT_STATE.md)

### Obsidian

- Vault ID / root: `secondbrain` / `/Users/kawakamiatsushishi/Desktop/secondbrain`
- `Projects/AI-Development-Framework/00_MOC.md` — GitHubをTask・検証の正本として使う。
- `Projects/AI-Development-Framework/02_Codex単独パイロット_2026-07-30.md` — Phase 0ではCodexとProject Ownerだけで始める。
- `Projects/AI-Development-Framework/03_役割分離Codexプローブ_2026-07-31.md` — Phase 0と後続の運用を混同しない必要がある。

## Context Read Record

- 現状の問題: 文書冒頭にはPhase 0でProject・Feature Branch・PRを必須にしないとあるが、本文の概要・Projects・Branch・PR節は、適用段階を示さず通常手順として読める。
- 採用する制約: Phase 0ではTask記録と人間レビューだけを検証する。自動push、PR、外部AI、自動化を導入しない。
- 既存状態: worktreeには本Taskより前の未commit・未追跡変更がある。対象外の変更をstage、commit、修正しない。

## Scope

- In scope: `docs/workflow/GITHUB_OPERATIONS.md`だけを変更し、各運用がPhase 0とPhase 1以降のどちらに適用されるかを明示する。
- Out of scope: GitHub Projectの作成、branch作成、PR作成、push、他文書の再編、ルールの実質的な変更、既存の未commit変更の整理。

## Plan

1. 文書の概要直後に、Phase 0とPhase 1以降の適用範囲を明示する。
2. Projects、Branch、PR、pushの節に、Phase 1以降の候補であることを短く示す。
3. Phase 0で使う最小経路として、Task・Project Owner Review・Current Stateを参照する。
4. Markdown整合性と、Phase 0でProject／PR／日次pushが必須に読めないことを検証する。

## Acceptance Criteria

- [x] 実装内容は`GITHUB_OPERATIONS.md`だけを変更する。
- [x] Phase 0の必須経路とPhase 1以降の候補が区別される。
- [x] Phase 0でGitHub Project、Feature Branch、PR、日次pushが必須ではないと読み取れる。
- [x] Markdown差分チェックと手動読解を記録する。
- [x] 実装差分に対するProject Owner Reviewを記録する。

> Taskの状態・検証を残すための本Task台帳とCurrent Stateの更新は、上記の実装文書スコープとは別の必須運用記録である。製品・運用方針の追加変更は含めない。

## Impact and Stop Conditions

- 影響: ADFの運用文書を明確化するだけで、コード・GitHub外部状態・履歴は変更しない。
- 停止: 別文書の変更、GitHub設定変更、commit・push、設計原則の変更が必要になった場合は`Blocked`または`Waiting Approval`へ戻る。

## Approval

- Approval required?: Yes（文書変更のScopeとPlan）。
- 承認対象: `docs/workflow/GITHUB_OPERATIONS.md`のみの上記4ステップ。
- 承認者: Project Owner。
- 承認記録: 2026-08-03、Project Ownerが`ADF-PILOT-002 設計OK`と明示し、上記ScopeとPlanを承認。

## Implementation and Verification Record

| 日時 | 実施者 | 内容 | 結果 |
| --- | --- | --- | --- |
| 2026-08-03 | Codex | `GITHUB_OPERATIONS.md`に適用段階、各節の適用条件、Task単位のpush確認を追記 | 完了 |
| 2026-08-03 | Codex | `git diff --check` | Pass |
| 2026-08-03 | Codex | 手動読解：Phase 0でProject、Feature Branch、PR、日次pushを必須と読めないことを確認 | Pass |

## 未実施

- 自動テストは対象がMarkdown運用文書のみのため実施しない。
- commit、push、GitHub設定変更はScope外のため実施しない。

## Project Owner Review

| 対象 | 決定 | 根拠・確認内容 | 日時 | 記録リンク |
| --- | --- | --- | --- | --- |
| Plan / Scope | Approved | `ADF-PILOT-002 設計OK` | 2026-08-03 | 本TaskのApproval記録 |
| Diff / Verification | Approved | `ADF-PILOT-002 レビューOK`。Project Ownerが実装差分と検証記録を確認 | 2026-08-03 | 本Taskのレビュー記録 |
| 残存リスク | Accepted | Phase 1以降の詳細なProject・PR運用は未導入。今回のPhase 0の範囲外として保持 | 2026-08-03 | 本TaskのScope |

## Handover

- `ADF-PILOT-002`は、Codex単独Phase 0で最初に数える完走Taskである。
- 得られた学び: 現在必須の手順と将来候補の手順を同じ文書に置く場合、適用段階を各節で明記しなければ、AIも人間も不要なGitHub操作を必須と誤認しうる。
- 次のTaskは自動開始しない。Project Ownerが、Phase 0の2件目として可逆で独立した小Taskを選定・承認する。
